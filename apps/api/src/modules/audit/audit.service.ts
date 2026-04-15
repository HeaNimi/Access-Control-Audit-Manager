import type { Kysely, Transaction } from 'kysely';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import type {
  AuditLogView,
  AuditLogsView,
  AuditObjectRef,
  AuditObjectType,
  AuditObjectView,
  ChangeRequestPayload,
  ChangeRequestSummary,
  CorrelationState,
  DirectoryAccountView,
  DirectoryGroupDetailView,
  ObservedEventView,
  RequestStatus,
  RequestTimelineItem,
} from '@acam-ts/contracts';
import type {
  ChangeRequestRow,
  DatabaseSchema,
  JsonObject,
} from '../../common/database/schema';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { DATABASE_TOKEN } from '../../common/database/database.constants';
import { ReadModelService } from '../../common/read-model/read-model.service';
import type {
  CorrelationTimelineLike,
  RequestLifecycleTimelineInput,
} from '../../common/read-model/read-model.types';
import {
  matchesDirectoryRef,
  valueMatches,
} from '../../common/utils/directory-ref.utils';
import {
  sanitizeJsonForPostgres,
  sanitizePostgresNullableText,
  sanitizePostgresText,
} from '../../common/utils/postgres-json.utils';
import { AuthService } from '../auth/auth.service';
import { DirectoryService } from '../directory/directory.service';
import { parseChangeRequestPayload } from '../requests/requests.validation';

export interface AuditWriteInput {
  requestId?: string | null;
  actor?: AuthenticatedUser | null;
  actorRole?: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  message?: string | null;
  eventDetails?: JsonObject;
}

type AuditWriteExecutor =
  | Kysely<DatabaseSchema>
  | Transaction<DatabaseSchema>;

@Injectable()
export class AuditService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
    private readonly readModelService: ReadModelService,
    private readonly authService: AuthService,
    private readonly directoryService: DirectoryService,
  ) {}

  async write(
    input: AuditWriteInput,
    executor: AuditWriteExecutor = this.db,
  ): Promise<number> {
    const inserted = await executor
      .insertInto('audit_log')
      .values({
        request_id: input.requestId ?? null,
        actor_user_id: input.actor?.userId ?? null,
        actor_username: input.actor?.username ?? null,
        actor_role: sanitizePostgresText(
          input.actorRole ?? input.actor?.roles[0] ?? 'system',
        ),
        event_type: sanitizePostgresText(input.eventType),
        entity_type: sanitizePostgresText(input.entityType),
        entity_id: sanitizePostgresNullableText(input.entityId),
        message: sanitizePostgresNullableText(input.message),
        event_details: sanitizeJsonForPostgres(input.eventDetails ?? {}),
      })
      .returning('audit_log_id')
      .executeTakeFirstOrThrow();

    return inserted.audit_log_id;
  }

  async list(
    page: number,
    pageSize: number,
    requestId?: string,
  ): Promise<AuditLogsView> {
    const normalizedPageSize = Math.max(1, Math.min(pageSize, 200));
    let baseQuery = this.db
      .selectFrom('audit_log')
      .leftJoin('system_user as su', 'su.user_id', 'audit_log.actor_user_id')
      .where('audit_log.event_type', '!=', 'observed_event_ingested');

    if (requestId) {
      baseQuery = baseQuery.where('request_id', '=', requestId);
    }

    const totalRow = await baseQuery
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    const totalEntries = Number(totalRow.count ?? 0);
    const totalPages = Math.max(
      1,
      Math.ceil(totalEntries / normalizedPageSize),
    );
    const normalizedPage = Math.max(1, Math.min(page, totalPages));
    const rows = await baseQuery
      .select([
        'audit_log.audit_log_id',
        'audit_log.event_type',
        'su.display_name as actor_display_name',
        'audit_log.actor_username',
        'audit_log.actor_role',
        'audit_log.entity_type',
        'audit_log.entity_id',
        'audit_log.message',
        'audit_log.event_details',
        'audit_log.created_at',
      ])
      .orderBy('audit_log.created_at', 'desc')
      .limit(normalizedPageSize)
      .offset((normalizedPage - 1) * normalizedPageSize)
      .execute();

    return {
      entries: rows.map((row) => this.readModelService.mapAuditRow(row)),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalEntries,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    };
  }

  async listEntries(requestId?: string): Promise<AuditLogView[]> {
    if (!requestId) {
      return [];
    }

    return this.listByRequestIds([requestId]);
  }

  async getObjectAudit(
    type: AuditObjectType,
    samAccountName: string,
  ): Promise<AuditObjectView> {
    const trimmedSamAccountName = samAccountName.trim();

    if (!trimmedSamAccountName) {
      throw new BadRequestException('samAccountName is required.');
    }

    let currentAccount: DirectoryAccountView | null = null;
    let currentGroup: DirectoryGroupDetailView | null = null;

    if (type === 'user') {
      currentAccount = await this.directoryService.getAccountBySamAccountName(
        trimmedSamAccountName,
      );
    } else {
      currentGroup = await this.directoryService.getGroupBySamAccountName(
        trimmedSamAccountName,
      );
    }

    const object = this.toAuditObjectRef(type, currentAccount, currentGroup);
    const requestRows = await this.db
      .selectFrom('change_request')
      .selectAll()
      .orderBy('submitted_at', 'desc')
      .execute();

    const relatedRequestRows = requestRows.filter((row) =>
      this.matchesRequestToObject(
        row,
        parseChangeRequestPayload(row.request_data),
        object,
      ),
    );
    const relatedRequestIds = relatedRequestRows.map((row) => row.request_id);
    const relatedRequests = await Promise.all(
      relatedRequestRows.map((row) => this.toSummary(row)),
    );
    const auditTrail = relatedRequestIds.length
      ? await this.listByRequestIds(relatedRequestIds)
      : [];
    const observedEvents = await this.listObservedEventsForObject(object);
    const observedEventIds = observedEvents.map(
      (event) => event.observedEventId,
    );
    const correlationRows =
      relatedRequestIds.length > 0 || observedEventIds.length > 0
        ? await this.db
            .selectFrom('event_correlation')
            .selectAll()
            .where((eb) => {
              const predicates = [];

              if (relatedRequestIds.length > 0) {
                predicates.push(eb('request_id', 'in', relatedRequestIds));
              }

              if (observedEventIds.length > 0) {
                predicates.push(
                  eb('observed_event_id', 'in', observedEventIds),
                );
              }

              return eb.or(predicates);
            })
            .orderBy('correlated_at', 'asc')
            .execute()
        : [];

    const timeline = await this.buildObjectTimeline({
      relatedRequestRows,
      relatedRequests,
      auditTrail,
      observedEvents,
      correlationRows,
    });

    return {
      object,
      currentAccount,
      currentGroup,
      relatedRequests,
      timeline,
      auditTrail,
      observedEvents,
    };
  }

  private async buildObjectTimeline(input: {
    relatedRequestRows: ChangeRequestRow[];
    relatedRequests: ChangeRequestSummary[];
    auditTrail: AuditLogView[];
    observedEvents: ObservedEventView[];
    correlationRows: Array<{
      correlation_id: number;
      request_id: string;
      observed_event_id: number | null;
      note: string | null;
      correlated_at: Date;
    }>;
  }): Promise<RequestTimelineItem[]> {
    const requestSummaryById = new Map(
      input.relatedRequests.map((request) => [request.requestId, request]),
    );
    const items: RequestTimelineItem[] = [];

    for (const request of input.relatedRequestRows) {
      const summary = requestSummaryById.get(request.request_id);

      if (!summary) {
        continue;
      }

      const approvals = await this.db
        .selectFrom('request_approval as ra')
        .leftJoin('system_user as su', 'su.user_id', 'ra.approver_user_id')
        .select([
          'ra.approval_id',
          'ra.decision',
          'ra.decision_comment',
          'ra.decided_at',
          'ra.created_at',
          'su.display_name',
        ])
        .where('ra.request_id', '=', request.request_id)
        .orderBy('ra.approval_step', 'asc')
        .execute();

      const execution = await this.db
        .selectFrom('request_execution')
        .selectAll()
        .where('request_id', '=', request.request_id)
        .executeTakeFirst();

      const lifecycleInput: RequestLifecycleTimelineInput = {
        request: {
          requestId: summary.requestId,
          requestNumber: summary.requestNumber,
          title: summary.title,
          requesterDisplayName: summary.requesterDisplayName,
          status: summary.status,
          submittedAt: summary.submittedAt,
        },
        approvals: approvals.map((approval) => ({
          approvalId: approval.approval_id,
          approverUserId: '',
          approverDisplayName: approval.display_name ?? 'Unknown approver',
          approverUsername: '',
          decision:
            approval.decision === 'approved' || approval.decision === 'rejected'
              ? approval.decision
              : null,
          decisionComment: approval.decision_comment,
          decidedAt: approval.decided_at?.toISOString() ?? null,
          createdAt: approval.created_at.toISOString(),
        })),
        execution: execution
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
          : null,
      };

      items.push(
        ...this.readModelService.buildRequestLifecycleTimeline(lifecycleInput),
      );
    }

    items.push(
      ...this.readModelService.buildAuditTimelineItems(input.auditTrail),
    );
    items.push(
      ...this.readModelService.buildObservedEventTimelineItems(
        input.observedEvents,
      ),
    );
    items.push(
      ...this.readModelService.buildCorrelationTimelineItems(
        input.correlationRows as CorrelationTimelineLike[],
      ),
    );

    return this.readModelService.sortTimelineItems(items);
  }

  private async toSummary(
    request: ChangeRequestRow,
  ): Promise<ChangeRequestSummary> {
    const payload = parseChangeRequestPayload(request.request_data);
    const requester = await this.authService.getUserById(
      request.requester_user_id,
    );
    const approval = await this.db
      .selectFrom('request_approval')
      .select(['approver_user_id'])
      .where('request_id', '=', request.request_id)
      .where('approval_step', '=', 1)
      .executeTakeFirst();
    const approver = approval
      ? await this.authService.getUserById(approval.approver_user_id)
      : undefined;
    const status = request.status as RequestStatus;

    return this.readModelService.buildChangeRequestSummary({
      request,
      payload,
      requesterDisplayName:
        requester?.displayName ?? request.requester_user_id ?? 'Unknown user',
      approverDisplayName: approver?.displayName ?? null,
      correlationState: await this.getDerivedRequestCorrelationState(
        request.request_id,
        status,
      ),
    });
  }

  private async getDerivedRequestCorrelationState(
    requestId: string,
    status: RequestStatus,
  ): Promise<CorrelationState> {
    if (status === 'rejected') {
      return 'rejected';
    }

    const matched = await this.db
      .selectFrom('event_correlation')
      .select('correlation_id')
      .where('request_id', '=', requestId)
      .executeTakeFirst();

    if (matched) {
      return 'matched';
    }

    if (status === 'executed' || status === 'failed') {
      return 'missing';
    }

    return 'pending';
  }

  private async getDerivedObservedEventCorrelationState(
    observedEventId: number,
  ): Promise<CorrelationState> {
    const matched = await this.db
      .selectFrom('event_correlation')
      .select('correlation_id')
      .where('observed_event_id', '=', observedEventId)
      .executeTakeFirst();

    if (matched) {
      return 'matched';
    }

    return 'out_of_band';
  }

  private async listByRequestIds(
    requestIds: string[],
  ): Promise<AuditLogView[]> {
    if (requestIds.length === 0) {
      return [];
    }

    const rows = await this.db
      .selectFrom('audit_log')
      .leftJoin('system_user as su', 'su.user_id', 'audit_log.actor_user_id')
      .select([
        'audit_log.audit_log_id',
        'audit_log.event_type',
        'su.display_name as actor_display_name',
        'audit_log.actor_username',
        'audit_log.actor_role',
        'audit_log.entity_type',
        'audit_log.entity_id',
        'audit_log.message',
        'audit_log.event_details',
        'audit_log.created_at',
      ])
      .where('request_id', 'in', requestIds)
      .orderBy('audit_log.created_at', 'desc')
      .execute();

    return rows.map((row) => this.readModelService.mapAuditRow(row));
  }

  private async listObservedEventsForObject(
    object: AuditObjectRef,
  ): Promise<ObservedEventView[]> {
    const rows = await this.db
      .selectFrom('observed_event')
      .selectAll()
      .orderBy('event_time', 'desc')
      .execute();
    const filteredRows = rows.filter((row) =>
      this.matchesObservedEventToObject(row, object),
    );

    const events = await Promise.all(
      filteredRows.map(async (row) => {
        const mapped = this.readModelService.mapObservedEventRow(
          row,
          await this.getDerivedObservedEventCorrelationState(
            row.observed_event_id,
          ),
        );
        const matchedRequest = await this.loadMatchedRequestSummary(
          row.observed_event_id,
        );

        return {
          ...mapped,
          matchedRequest,
        };
      }),
    );

    return events.sort((left, right) =>
      right.eventTime.localeCompare(left.eventTime),
    );
  }

  private async loadMatchedRequestSummary(observedEventId: number) {
    const matchedRequest = await this.db
      .selectFrom('event_correlation as ec')
      .innerJoin('change_request as cr', 'cr.request_id', 'ec.request_id')
      .select([
        'cr.request_id as requestId',
        'cr.request_number as requestNumber',
        'cr.title as title',
        'cr.status as status',
      ])
      .where('ec.observed_event_id', '=', observedEventId)
      .orderBy('ec.correlated_at', 'asc')
      .executeTakeFirst();

    return matchedRequest
      ? {
          requestId: matchedRequest.requestId,
          requestNumber: matchedRequest.requestNumber,
          title: matchedRequest.title,
          status: matchedRequest.status,
        }
      : null;
  }

  private matchesRequestToObject(
    request: ChangeRequestRow,
    payload: ChangeRequestPayload,
    object: AuditObjectRef,
  ): boolean {
    if (
      matchesDirectoryRef(
        {
          objectGuid: request.target_object_guid ?? undefined,
          objectSid: request.target_object_sid ?? undefined,
          distinguishedName: request.target_distinguished_name ?? undefined,
          samAccountName: request.target_sam_account_name ?? undefined,
          displayName: request.target_display_name ?? undefined,
        },
        object,
      )
    ) {
      return true;
    }

    if (object.objectType === 'user') {
      switch (payload.kind) {
        case 'group_change':
          return payload.memberChanges.some((change) =>
            matchesDirectoryRef(change.member, object),
          );
        case 'group_membership_add':
        case 'group_membership_remove':
          return matchesDirectoryRef(payload.member, object);
        default:
          return false;
      }
    }

    switch (payload.kind) {
      case 'user_create':
        return (payload.initialGroups ?? []).some((group) =>
          matchesDirectoryRef(group, object),
        );
      case 'account_change':
        return (payload.groupChanges ?? []).some((change) =>
          matchesDirectoryRef(change.group, object),
        );
      case 'group_membership_add':
      case 'group_membership_remove':
        return matchesDirectoryRef(payload.group, object);
      default:
        return false;
    }
  }

  private matchesObservedEventToObject(
    event: {
      object_guid: string | null;
      distinguished_name: string | null;
      sam_account_name: string | null;
      subject_account_name: string | null;
    },
    object: AuditObjectRef,
  ): boolean {
    if (
      matchesDirectoryRef(
        {
          objectGuid: event.object_guid ?? undefined,
          distinguishedName: event.distinguished_name ?? undefined,
          samAccountName: event.sam_account_name ?? undefined,
        },
        object,
      )
    ) {
      return true;
    }

    return (
      object.objectType === 'user' &&
      valueMatches(event.subject_account_name, object.samAccountName)
    );
  }

  private toAuditObjectRef(
    type: AuditObjectType,
    currentAccount: DirectoryAccountView | null,
    currentGroup: DirectoryGroupDetailView | null,
  ): AuditObjectRef {
    if (type === 'user' && currentAccount) {
      return {
        objectType: 'user',
        samAccountName: currentAccount.samAccountName,
        distinguishedName: currentAccount.distinguishedName,
        displayName: currentAccount.displayName,
        objectGuid: currentAccount.objectGuid,
        objectSid: currentAccount.objectSid,
      };
    }

    if (type === 'group' && currentGroup) {
      return {
        objectType: 'group',
        samAccountName:
          currentGroup.samAccountName ??
          currentGroup.displayName ??
          currentGroup.distinguishedName,
        distinguishedName: currentGroup.distinguishedName,
        displayName: currentGroup.displayName,
        objectGuid: currentGroup.objectGuid,
      };
    }

    throw new BadRequestException('Unable to resolve the selected object.');
  }
}
