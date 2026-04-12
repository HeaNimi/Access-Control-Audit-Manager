import type { Kysely } from 'kysely';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  type ChangeRequestDetail,
  type ChangeRequestPayload,
  type ChangeRequestSummary,
  type AuthenticatedUserProfile,
  type DirectoryExecutionResult,
  type RequestApprovalView,
  type RequestType,
  type RequestTimelineItem,
} from '@acam-ts/contracts';
import type {
  ChangeRequestRow,
  DatabaseSchema,
} from '../../common/database/schema';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { DATABASE_TOKEN } from '../../common/database/database.constants';
import { ReadModelService } from '../../common/read-model/read-model.service';
import {
  resolveCreatedDescription,
  sanitizeRequestPayloadForResponse,
} from '../../common/utils/request-payload.utils';
import {
  sanitizeJsonForPostgres,
  sanitizePostgresText,
} from '../../common/utils/postgres-json.utils';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { CorrelationService } from '../correlation/correlation.service';
import { DirectoryService } from '../directory/directory.service';
import { ApprovalDecisionDto } from './dto/approval-decision.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import {
  getTargetColumns,
  parseChangeRequestPayload,
} from './requests.validation';

@Injectable()
export class RequestsService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly directoryService: DirectoryService,
    private readonly correlationService: CorrelationService,
    private readonly readModelService: ReadModelService,
  ) {}

  async create(
    dto: CreateChangeRequestDto,
    actor: AuthenticatedUser,
  ): Promise<ChangeRequestDetail> {
    const initialPayload = this.safeParsePayload(dto.payload);
    const approver = await this.authService.resolveApproverByUsername(
      dto.approverUsername,
    );

    const request = await this.db.transaction().execute(async (trx) => {
      const createdRequest = await trx
        .insertInto('change_request')
        .values({
          request_type: initialPayload.kind,
          status: 'submitted',
          title: dto.title,
          justification: dto.justification,
          requester_user_id: actor.userId,
          request_data: initialPayload as unknown as Record<string, unknown>,
          ...getTargetColumns(initialPayload),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const finalizedPayload = this.finalizePayloadForCreatedRequest(
        initialPayload,
        createdRequest.request_number,
      );

      if (JSON.stringify(finalizedPayload) !== JSON.stringify(initialPayload)) {
        await trx
          .updateTable('change_request')
          .set({
            request_data: finalizedPayload as unknown as Record<
              string,
              unknown
            >,
          })
          .where('request_id', '=', createdRequest.request_id)
          .execute();
      }

      await trx
        .insertInto('request_approval')
        .values({
          request_id: createdRequest.request_id,
          approver_user_id: approver.userId,
          approval_step: 1,
          is_required: true,
        })
        .execute();

      return createdRequest;
    });

    await this.auditService.write({
      requestId: request.request_id,
      actor,
      eventType: 'request_submitted',
      entityType: 'change_request',
      entityId: request.request_id,
      message: 'Change request submitted.',
      eventDetails: {
        requestNumber: request.request_number,
        requestType: request.request_type,
      },
    });

    return this.getDetail(request.request_id);
  }

  async list(): Promise<ChangeRequestSummary[]> {
    const rows = await this.db
      .selectFrom('change_request')
      .selectAll()
      .orderBy('submitted_at', 'desc')
      .execute();

    const summaries: ChangeRequestSummary[] = [];

    for (const row of rows) {
      summaries.push(await this.toSummary(row));
    }

    return summaries;
  }

  async getDetail(requestId: string): Promise<ChangeRequestDetail> {
    const request = await this.getRequestByIdOrThrow(requestId);
    const summary = await this.toSummary(request);
    const requester = await this.getUserByIdOrThrow(request.requester_user_id);
    const payload = sanitizeRequestPayloadForResponse(
      parseChangeRequestPayload(request.request_data),
    );
    const approvals = await this.loadApprovals(requestId);
    const execution = await this.loadExecution(requestId);
    const auditTrail = await this.auditService.listEntries(requestId);
    const correlationRows = await this.loadCorrelations(requestId);
    const observedEvents = await this.loadObservedEvents(correlationRows);

    return {
      ...summary,
      requester,
      payload,
      approvals: this.mapApprovals(approvals),
      execution: this.mapExecution(execution),
      auditTrail,
      observedEvents,
      correlations: correlationRows.map((correlation) => ({
        correlationId: correlation.correlation_id,
        observedEventId: correlation.observed_event_id,
        auditLogId: correlation.audit_log_id,
        note: correlation.note,
        correlatedAt: correlation.correlated_at.toISOString(),
      })),
    };
  }

  async decide(
    requestId: string,
    dto: ApprovalDecisionDto,
    actor: AuthenticatedUser,
  ): Promise<ChangeRequestDetail> {
    const approval = await this.loadPrimaryApproval(requestId);

    if (!approval) {
      throw new NotFoundException('Approval entry not found.');
    }

    if (
      approval.approver_user_id !== actor.userId &&
      !actor.roles.includes('administrator')
    ) {
      throw new ForbiddenException(
        'You are not assigned to approve this request.',
      );
    }

    if (approval.decision) {
      throw new BadRequestException('This request has already been decided.');
    }

    const decisionTimestamp = new Date();

    await this.persistApprovalDecision({
      requestId,
      approvalId: approval.approval_id,
      decision: dto.decision,
      decisionComment: dto.decisionComment ?? null,
      decisionTimestamp,
    });

    await this.auditService.write({
      requestId,
      actor,
      eventType:
        dto.decision === 'approved' ? 'request_approved' : 'request_rejected',
      entityType: 'request_approval',
      entityId: approval.approval_id,
      message:
        dto.decision === 'approved'
          ? 'Change request approved.'
          : 'Change request rejected.',
      eventDetails: {
        decisionComment: dto.decisionComment ?? null,
      },
    });

    if (dto.decision === 'approved') {
      await this.executeApprovedRequest(requestId);
    }

    return this.getDetail(requestId);
  }

  async retryExecution(
    requestId: string,
    actor: AuthenticatedUser,
  ): Promise<ChangeRequestDetail> {
    const request = await this.getRequestByIdOrThrow(requestId);

    if (request.status !== 'failed') {
      throw new BadRequestException(
        'Only failed change requests can be retried.',
      );
    }

    const execution = await this.loadExecution(requestId);

    if (!execution || execution.execution_status !== 'failed') {
      throw new BadRequestException(
        'Only failed request executions can be retried.',
      );
    }

    const approval = await this.loadPrimaryApproval(requestId);

    if (approval?.decision !== 'approved') {
      throw new BadRequestException('Only approved requests can be retried.');
    }

    await this.auditService.write({
      requestId,
      actor,
      eventType: 'execution_retry_requested',
      entityType: 'request_execution',
      entityId: execution.execution_id,
      message: 'Directory execution retry requested after a failed attempt.',
      eventDetails: {
        previousExecutionStatus: execution.execution_status,
        previousErrorMessage: execution.error_message,
      },
    });

    await this.executeApprovedRequest(requestId);

    return this.getDetail(requestId);
  }

  async getTimeline(requestId: string): Promise<RequestTimelineItem[]> {
    const detail = await this.getDetail(requestId);
    return this.readModelService.buildRequestTimeline({
      request: {
        requestId: detail.requestId,
        requestNumber: detail.requestNumber,
        title: detail.title,
        requesterDisplayName: detail.requester.displayName,
        status: detail.status,
        submittedAt: detail.submittedAt,
      },
      approvals: detail.approvals,
      execution: detail.execution,
      auditTrail: detail.auditTrail,
      observedEvents: detail.observedEvents,
      correlations: detail.correlations,
    });
  }

  private async executeApprovedRequest(requestId: string): Promise<void> {
    const request = await this.getRequestByIdOrThrow(requestId);
    const payload = parseChangeRequestPayload(request.request_data);
    const startedAt = new Date();

    await this.markExecutionStarted(requestId, startedAt);

    await this.auditService.write({
      requestId,
      actorRole: 'system',
      eventType: 'execution_started',
      entityType: 'request_execution',
      entityId: requestId,
      message: 'Automatic directory execution started.',
      eventDetails: {
        requestType: request.request_type,
      },
    });

    const result = await this.executeDirectoryRequestSafely({
      requestId,
      requestNumber: request.request_number,
      requestType: request.request_type as RequestType,
      payload,
    });
    const finishedAt = new Date();

    await this.markExecutionFinished(requestId, result, finishedAt);

    await this.auditService.write({
      requestId,
      actorRole: 'system',
      eventType: result.success ? 'execution_finished' : 'execution_failed',
      entityType: 'request_execution',
      entityId: requestId,
      message: sanitizePostgresText(result.message),
      eventDetails: {
        changedDn: result.changedDn,
        changedAttributes: result.changedAttributes ?? [],
        raw: sanitizeJsonForPostgres(result.raw ?? {}),
      },
    });

    await this.correlationService.correlateRequest(requestId);
  }

  private async executeDirectoryRequestSafely(context: {
    requestId: string;
    requestNumber: number;
    requestType: RequestType;
    payload: ChangeRequestPayload;
  }): Promise<DirectoryExecutionResult> {
    try {
      return await this.directoryService.execute(context);
    } catch (error) {
      return this.buildExecutionFailureResult(error);
    }
  }

  private async getRequestByIdOrThrow(
    requestId: string,
  ): Promise<ChangeRequestRow> {
    const request = await this.db
      .selectFrom('change_request')
      .selectAll()
      .where('request_id', '=', requestId)
      .executeTakeFirst();

    if (!request) {
      throw new NotFoundException('Change request not found.');
    }

    return request;
  }

  private async loadPrimaryApproval(requestId: string) {
    return this.db
      .selectFrom('request_approval')
      .selectAll()
      .where('request_id', '=', requestId)
      .where('approval_step', '=', 1)
      .executeTakeFirst();
  }

  private async loadApprovals(requestId: string) {
    return this.db
      .selectFrom('request_approval as ra')
      .innerJoin('system_user as su', 'su.user_id', 'ra.approver_user_id')
      .select([
        'ra.approval_id',
        'ra.approver_user_id',
        'ra.decision',
        'ra.decision_comment',
        'ra.decided_at',
        'ra.created_at',
        'su.display_name',
        'su.username',
      ])
      .where('ra.request_id', '=', requestId)
      .orderBy('ra.approval_step', 'asc')
      .execute();
  }

  private mapApprovals(
    approvals: Awaited<ReturnType<RequestsService['loadApprovals']>>,
  ): RequestApprovalView[] {
    return approvals.map((approval) => {
      const decision: RequestApprovalView['decision'] =
        approval.decision === 'approved' || approval.decision === 'rejected'
          ? approval.decision
          : null;

      return {
        approvalId: approval.approval_id,
        approverUserId: approval.approver_user_id,
        approverDisplayName: approval.display_name,
        approverUsername: approval.username,
        decision,
        decisionComment: approval.decision_comment,
        decidedAt: approval.decided_at?.toISOString() ?? null,
        createdAt: approval.created_at.toISOString(),
      };
    });
  }

  private async loadExecution(requestId: string) {
    return this.db
      .selectFrom('request_execution')
      .selectAll()
      .where('request_id', '=', requestId)
      .executeTakeFirst();
  }

  private mapExecution(
    execution: Awaited<ReturnType<RequestsService['loadExecution']>>,
  ) {
    return execution
      ? {
          executionId: execution.execution_id,
          executionStatus: execution.execution_status as
            | 'executing'
            | 'executed'
            | 'failed'
            | 'cancelled',
          startedAt: execution.started_at.toISOString(),
          finishedAt: execution.finished_at?.toISOString() ?? null,
          errorMessage: execution.error_message,
          executionResult: execution.execution_result,
        }
      : null;
  }

  private async loadCorrelations(requestId: string) {
    return this.db
      .selectFrom('event_correlation')
      .selectAll()
      .where('request_id', '=', requestId)
      .orderBy('correlated_at', 'asc')
      .execute();
  }

  private async loadObservedEvents(
    correlations: Awaited<ReturnType<RequestsService['loadCorrelations']>>,
  ) {
    const observedEvents = [];

    for (const correlation of correlations) {
      if (!correlation.observed_event_id) {
        continue;
      }

      const event = await this.db
        .selectFrom('observed_event')
        .selectAll()
        .where('observed_event_id', '=', correlation.observed_event_id)
        .executeTakeFirst();

      if (!event) {
        continue;
      }

      observedEvents.push(
        this.readModelService.mapObservedEventRow(
          event,
          await this.correlationService.getObservedEventCorrelationState(
            event.observed_event_id,
          ),
        ),
      );
    }

    return observedEvents;
  }

  private async persistApprovalDecision(input: {
    requestId: string;
    approvalId: string;
    decision: 'approved' | 'rejected';
    decisionComment: string | null;
    decisionTimestamp: Date;
  }): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('request_approval')
        .set({
          decision: input.decision,
          decision_comment: input.decisionComment,
          decided_at: input.decisionTimestamp,
        })
        .where('approval_id', '=', input.approvalId)
        .execute();

      await trx
        .updateTable('change_request')
        .set({
          status: input.decision === 'approved' ? 'approved' : 'rejected',
          approved_at:
            input.decision === 'approved' ? input.decisionTimestamp : null,
        })
        .where('request_id', '=', input.requestId)
        .execute();
    });
  }

  private async markExecutionStarted(
    requestId: string,
    startedAt: Date,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('request_execution')
        .values({
          request_id: requestId,
          execution_status: 'executing',
          started_at: startedAt,
          execution_result: {},
        })
        .onConflict((oc) =>
          oc.column('request_id').doUpdateSet({
            execution_status: 'executing',
            started_at: startedAt,
            finished_at: null,
            execution_result: {},
            error_message: null,
          }),
        )
        .execute();

      await trx
        .updateTable('change_request')
        .set({ status: 'executing' })
        .where('request_id', '=', requestId)
        .execute();
    });
  }

  private async markExecutionFinished(
    requestId: string,
    result: DirectoryExecutionResult,
    finishedAt: Date,
  ): Promise<void> {
    const executionResult = sanitizeJsonForPostgres(
      result.raw ?? { message: result.message },
    );
    const errorMessage = result.success
      ? null
      : sanitizePostgresText(result.message);

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('request_execution')
        .set({
          execution_status: result.success ? 'executed' : 'failed',
          finished_at: finishedAt,
          execution_result: executionResult,
          error_message: errorMessage,
        })
        .where('request_id', '=', requestId)
        .execute();

      await trx
        .updateTable('change_request')
        .set({
          status: result.success ? 'executed' : 'failed',
          executed_at: result.success ? finishedAt : null,
        })
        .where('request_id', '=', requestId)
        .execute();
    });
  }

  private buildExecutionFailureResult(
    error: unknown,
  ): DirectoryExecutionResult {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Automatic directory execution failed.';

    return {
      success: false,
      message,
      raw: {
        mode: 'ldap',
        steps: [
          {
            name: 'directory-operation',
            status: 'failed',
            attempts: 1,
            detail: {
              error: message,
            },
          },
        ],
        failedStep: {
          name: 'directory-operation',
          status: 'failed',
          attempts: 1,
          detail: {
            error: message,
          },
        },
        ldapErrorMessage: message,
        partialChangesPossible: false,
      },
    };
  }

  private async toSummary(
    request: ChangeRequestRow,
  ): Promise<ChangeRequestSummary> {
    const payload = parseChangeRequestPayload(request.request_data);
    const requester = await this.getUserByIdOrThrow(request.requester_user_id);
    const approval = await this.db
      .selectFrom('request_approval')
      .select(['approver_user_id'])
      .where('request_id', '=', request.request_id)
      .where('approval_step', '=', 1)
      .executeTakeFirst();
    const approver = approval
      ? await this.authService.getUserById(approval.approver_user_id)
      : undefined;
    const status = request.status as
      | 'draft'
      | 'submitted'
      | 'approved'
      | 'rejected'
      | 'executing'
      | 'executed'
      | 'failed'
      | 'closed';

    return this.readModelService.buildChangeRequestSummary({
      request,
      payload,
      requesterDisplayName: requester.displayName,
      approverDisplayName: approver?.displayName ?? null,
      correlationState:
        await this.correlationService.getRequestCorrelationState(
          request.request_id,
          status,
        ),
    });
  }

  private safeParsePayload(
    payload: Record<string, unknown>,
  ): ChangeRequestPayload {
    try {
      return parseChangeRequestPayload(payload);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid request payload.',
      );
    }
  }

  private async getUserByIdOrThrow(
    userId: string,
  ): Promise<AuthenticatedUserProfile> {
    const user = await this.authService.getUserById(userId);

    if (!user) {
      throw new NotFoundException(`System user ${userId} was not found.`);
    }

    return user;
  }

  private finalizePayloadForCreatedRequest(
    payload: ChangeRequestPayload,
    requestNumber: number,
  ): ChangeRequestPayload {
    if (payload.kind !== 'user_create') {
      return payload;
    }

    const nextDescription = resolveCreatedDescription(
      payload.target.description ?? null,
      requestNumber,
    );

    if (nextDescription === (payload.target.description ?? null)) {
      return payload;
    }

    return {
      ...payload,
      target: {
        ...payload.target,
        description: nextDescription,
      },
    };
  }
}
