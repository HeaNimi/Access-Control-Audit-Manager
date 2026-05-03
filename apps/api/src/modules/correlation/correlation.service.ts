import type { Kysely } from 'kysely';
import { Inject, Injectable } from '@nestjs/common';

import type {
  CorrelationDiagnosticAttempt,
  CorrelationDiagnosticObservedEvent,
  CorrelationDiagnosticsView,
  CorrelationState,
  RequestStatus,
} from '@acam-ts/contracts';
import type {
  AuditLogRow,
  ChangeRequestRow,
  DatabaseSchema,
  ObservedEventRow,
  RequestExecutionRow,
} from '../../common/database/schema';

import { DATABASE_TOKEN } from '../../common/database/database.constants';
import { AppLogService } from '../../common/logging/app-log.service';
import {
  collectMatchedCorrelationSignals,
  doesObservedEventMatchRequest,
  evaluateObservedEventForRequest,
  getExpectedCorrelationSignals,
  getExpectedEventIds,
} from './correlation-signals.utils';
import { AuditService } from '../audit/audit.service';
import { parseChangeRequestPayload } from '../requests/requests.validation';

@Injectable()
export class CorrelationService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
    private readonly auditService: AuditService,
    private readonly appLogService: AppLogService,
  ) {}

  async correlateRequest(requestId: string): Promise<void> {
    const request = await this.db
      .selectFrom('change_request')
      .selectAll()
      .where('request_id', '=', requestId)
      .executeTakeFirst();

    if (!request) {
      return;
    }

    const execution = await this.loadCurrentExecution(requestId);
    const attempts = await this.loadExecutionAttempts(requestId, execution);

    const candidates = await this.findCandidateObservedEventsForRequest(
      request,
      attempts,
    );
    let matchedCount = 0;
    let ambiguousCount = 0;

    for (const event of candidates) {
      const matchingRequests = await this.findMatchingRequestIdsForEvent(event);

      if (matchingRequests.length === 1 && matchingRequests[0] === requestId) {
        await this.createEventCorrelation(
          requestId,
          event.observed_event_id,
          'Matched by request workflow',
        );
        matchedCount += 1;
      } else if (matchingRequests.length > 1) {
        ambiguousCount += 1;
        this.appLogService.warning(
          'correlation',
          'Observed event matched multiple requests and was not auto-correlated.',
          {
            requestId,
            observedEventId: event.observed_event_id,
            matchingRequestIds: matchingRequests,
          },
        );
      }
    }

    this.appLogService.info('correlation', 'Request correlation evaluated.', {
      requestId,
      requestNumber: request.request_number,
      requestType: request.request_type,
      executionAttemptCount: attempts.length,
      candidateCount: candidates.length,
      matchedCount,
      ambiguousCount,
    });
  }

  async correlateObservedEvent(observedEventId: number): Promise<void> {
    const event = await this.db
      .selectFrom('observed_event')
      .selectAll()
      .where('observed_event_id', '=', observedEventId)
      .executeTakeFirst();

    if (!event) {
      return;
    }

    const matches = await this.findMatchingRequestIdsForEvent(event);

    if (matches.length === 1) {
      await this.createEventCorrelation(
        matches[0],
        observedEventId,
        'Matched on event ingest',
      );
      this.appLogService.info('correlation', 'Observed event correlated.', {
        observedEventId,
        requestId: matches[0],
      });
    } else if (matches.length > 1) {
      this.appLogService.warning(
        'correlation',
        'Observed event matched multiple requests and was not auto-correlated.',
        {
          observedEventId,
          matchingRequestIds: matches,
        },
      );
    } else {
      this.appLogService.info(
        'correlation',
        'Observed event did not match a request.',
        {
          observedEventId,
          eventId: event.event_id,
          eventType: event.event_type,
          eventTime: event.event_time.toISOString(),
          distinguishedName: event.distinguished_name,
          samAccountName: event.sam_account_name,
          subjectAccountName: event.subject_account_name,
        },
      );
    }
  }

  async getRequestCorrelationState(
    requestId: string,
    status: RequestStatus,
  ): Promise<CorrelationState> {
    if (status === 'rejected') {
      return 'rejected';
    }

    const request = await this.db
      .selectFrom('change_request')
      .select([
        'request_type',
        'request_data',
        'target_object_guid',
        'target_object_sid',
        'target_distinguished_name',
        'target_sam_account_name',
      ])
      .where('request_id', '=', requestId)
      .executeTakeFirst();

    if (!request) {
      return status === 'executed' || status === 'failed'
        ? 'missing'
        : 'pending';
    }

    const payload = parseChangeRequestPayload(request.request_data);
    const execution = await this.loadCurrentExecution(requestId);
    const attempts = await this.loadExecutionAttempts(requestId, execution);
    const matchedEvents = await this.db
      .selectFrom('event_correlation as ec')
      .innerJoin(
        'observed_event as oe',
        'oe.observed_event_id',
        'ec.observed_event_id',
      )
      .selectAll('oe')
      .where('ec.request_id', '=', requestId)
      .execute();

    if (
      (request.request_type === 'account_change' &&
        payload.kind === 'account_change') ||
      (request.request_type === 'account_update' &&
        payload.kind === 'account_update') ||
      (request.request_type === 'group_change' &&
        payload.kind === 'group_change') ||
      (request.request_type === 'user_create' && payload.kind === 'user_create')
    ) {
      const latestExecutionResult =
        attempts.at(-1)?.executionResult ?? execution?.execution_result;
      const expectedSignals = getExpectedCorrelationSignals(
        payload,
        latestExecutionResult,
      );
      const matchedSignals = new Set(
        attempts.length > 0
          ? attempts.flatMap((attempt) =>
              collectMatchedCorrelationSignals(
                matchedEvents,
                request,
                payload,
                attempt.executionResult,
              ),
            )
          : collectMatchedCorrelationSignals(
              matchedEvents,
              request,
              payload,
              execution?.execution_result,
            ),
      );

      if (
        expectedSignals.length > 0 &&
        expectedSignals.every((signal) => matchedSignals.has(signal))
      ) {
        return 'matched';
      }
    } else if (matchedEvents.length > 0) {
      return 'matched';
    }

    if (status === 'executed' || status === 'failed') {
      return 'missing';
    }

    return 'pending';
  }

  async getObservedEventCorrelationState(
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

  async getDiagnostics(
    requestId: string,
  ): Promise<CorrelationDiagnosticsView | null> {
    const request = await this.db
      .selectFrom('change_request')
      .selectAll()
      .where('request_id', '=', requestId)
      .executeTakeFirst();

    if (!request) {
      return null;
    }

    const payload = parseChangeRequestPayload(request.request_data);
    const execution = await this.loadCurrentExecution(requestId);
    const attempts = await this.loadExecutionAttempts(requestId, execution);
    const latestExecutionResult =
      attempts.at(-1)?.executionResult ?? execution?.execution_result;
    const expectedEventIds = getExpectedEventIds(request.request_type, payload);
    const expectedSignals = getExpectedCorrelationSignals(
      payload,
      latestExecutionResult,
    );
    const correlatedRows = await this.loadCorrelatedObservedEventRows(requestId);
    const diagnosticAttempts = this.buildDiagnosticAttempts(
      attempts,
      request,
      payload,
      correlatedRows,
    );
    const candidateRows = await this.findDiagnosticObservedEvents(
      request,
      attempts,
      expectedEventIds,
    );
    const correlatedIds = new Set(
      correlatedRows.map((row) => row.observed_event_id),
    );
    const correlatedEvents = await Promise.all(
      correlatedRows.map((row) =>
        this.mapDiagnosticObservedEvent(row, request, attempts, true),
      ),
    );
    const candidateEvents = await Promise.all(
      candidateRows
        .filter((row) => !correlatedIds.has(row.observed_event_id))
        .map((row) =>
          this.mapDiagnosticObservedEvent(row, request, attempts, false),
        ),
    );
    const matchedSignals = Array.from(
      new Set(
        correlatedEvents.flatMap((event) => event.matchedSignals),
      ),
    );

    return {
      requestId: request.request_id,
      requestNumber: request.request_number,
      requestType: request.request_type as CorrelationDiagnosticsView['requestType'],
      status: request.status as CorrelationDiagnosticsView['status'],
      expectedEventIds,
      expectedSignals,
      matchedSignals,
      attempts: diagnosticAttempts,
      correlatedEvents,
      candidateEvents,
    };
  }

  private async createEventCorrelation(
    requestId: string,
    observedEventId: number,
    note: string,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('event_correlation')
        .select('correlation_id')
        .where('request_id', '=', requestId)
        .where('observed_event_id', '=', observedEventId)
        .executeTakeFirst();

      if (existing) {
        return;
      }

      const auditLogId = await this.auditService.write(
        {
          requestId,
          actorRole: 'system',
          eventType: 'correlation_matched',
          entityType: 'observed_event',
          entityId: String(observedEventId),
          message: note,
          eventDetails: {
            observedEventId,
          },
        },
        trx,
      );

      await trx
        .insertInto('event_correlation')
        .values({
          request_id: requestId,
          audit_log_id: auditLogId,
          observed_event_id: observedEventId,
          note,
        })
        .execute();
    });
  }

  private async findCandidateObservedEventsForRequest(
    request: ChangeRequestRow,
    attempts: CorrelationExecutionAttempt[],
  ): Promise<ObservedEventRow[]> {
    const windowSeconds = Number(
      process.env.CORRELATION_WINDOW_SECONDS ?? '60',
    );
    const payload = parseChangeRequestPayload(request.request_data);
    const expectedEventIds = getExpectedEventIds(request.request_type, payload);
    const windows =
      attempts.length > 0
        ? attempts
        : [
            {
              startedAt: request.approved_at ?? request.submitted_at,
              finishedAt: request.executed_at ?? new Date(),
              executionResult: undefined,
            },
          ];
    const candidatesById = new Map<number, ObservedEventRow>();

    for (const attempt of windows) {
      const lowerBound = new Date(
        attempt.startedAt.getTime() - windowSeconds * 1000,
      );
      const upperBound = new Date(
        (attempt.finishedAt ?? new Date()).getTime() + windowSeconds * 1000,
      );
      let query = this.db
        .selectFrom('observed_event as oe')
        .leftJoin(
          'event_correlation as ec',
          'ec.observed_event_id',
          'oe.observed_event_id',
        )
        .selectAll('oe')
        .where('ec.observed_event_id', 'is', null)
        .where('oe.event_time', '>=', lowerBound)
        .where('oe.event_time', '<=', upperBound);

      if (expectedEventIds.length > 0) {
        query = query.where((eb) =>
          eb.or([
            eb('oe.event_id', 'in', expectedEventIds),
            eb('oe.event_type', '=', request.request_type),
          ]),
        );
      }

      const rows = await query.execute();

      for (const row of rows) {
        if (
          doesObservedEventMatchRequest(
            row,
            request,
            payload,
            attempt.executionResult,
          )
        ) {
          candidatesById.set(row.observed_event_id, row);
        }
      }
    }

    return Array.from(candidatesById.values());
  }

  private async findDiagnosticObservedEvents(
    request: ChangeRequestRow,
    attempts: CorrelationExecutionAttempt[],
    expectedEventIds: number[],
  ): Promise<ObservedEventRow[]> {
    const lowerBound = new Date(
      (request.submitted_at ?? new Date()).getTime() -
        this.getCorrelationWindowSeconds() * 1000,
    );
    const upperBound = new Date(
      Math.max(
        Date.now(),
        request.executed_at?.getTime() ?? 0,
        ...attempts.map(
          (attempt) => attempt.finishedAt?.getTime() ?? attempt.startedAt.getTime(),
        ),
      ) +
        this.getCorrelationWindowSeconds() * 1000,
    );
    let query = this.db
      .selectFrom('observed_event')
      .selectAll()
      .where('event_time', '>=', lowerBound)
      .where('event_time', '<=', upperBound)
      .orderBy('event_time', 'asc')
      .limit(250);

    if (expectedEventIds.length > 0) {
      query = query.where((eb) =>
        eb.or([
          eb('event_id', 'in', expectedEventIds),
          eb('event_type', '=', request.request_type),
        ]),
      );
    }

    return query.execute();
  }

  private async findMatchingRequestIdsForEvent(
    event: ObservedEventRow,
  ): Promise<string[]> {
    const requests = await this.db
      .selectFrom('change_request')
      .selectAll()
      .where('status', 'in', ['approved', 'executing', 'executed', 'failed'])
      .execute();

    const matches: string[] = [];

    for (const request of requests) {
      const execution = await this.loadCurrentExecution(request.request_id);
      const attempts = await this.loadExecutionAttempts(
        request.request_id,
        execution,
      );
      const payload = parseChangeRequestPayload(request.request_data);
      const matchingAttempt = this.findMatchingAttemptForEvent(
        event,
        request,
        attempts,
        (attempt) =>
          doesObservedEventMatchRequest(
            event,
            request,
            payload,
            attempt.executionResult,
          ),
      );

      if (matchingAttempt) {
        matches.push(request.request_id);
      }
    }

    return matches;
  }

  private findMatchingAttemptForEvent(
    event: ObservedEventRow,
    request: ChangeRequestRow,
    attempts: CorrelationExecutionAttempt[],
    predicate: (attempt: CorrelationExecutionAttempt) => boolean = () => true,
  ): CorrelationExecutionAttempt | undefined {
    const windowSeconds = this.getCorrelationWindowSeconds();
    const windows =
      attempts.length > 0
        ? attempts
        : [
            {
              startedAt: request.approved_at ?? request.submitted_at,
              finishedAt: request.executed_at ?? new Date(),
              executionResult: undefined,
            },
          ];

    return windows.find((attempt) => {
      const lowerBound = new Date(
        attempt.startedAt.getTime() - windowSeconds * 1000,
      );
      const upperBound = new Date(
        (attempt.finishedAt ?? new Date()).getTime() + windowSeconds * 1000,
      );

      return (
        event.event_time >= lowerBound &&
        event.event_time <= upperBound &&
        predicate(attempt)
      );
    });
  }

  private async loadCurrentExecution(
    requestId: string,
  ): Promise<RequestExecutionRow | undefined> {
    return this.db
      .selectFrom('request_execution')
      .selectAll()
      .where('request_id', '=', requestId)
      .executeTakeFirst();
  }

  private async loadCorrelatedObservedEventRows(
    requestId: string,
  ): Promise<ObservedEventRow[]> {
    return this.db
      .selectFrom('event_correlation as ec')
      .innerJoin(
        'observed_event as oe',
        'oe.observed_event_id',
        'ec.observed_event_id',
      )
      .selectAll('oe')
      .where('ec.request_id', '=', requestId)
      .orderBy('oe.event_time', 'asc')
      .execute();
  }

  private buildDiagnosticAttempts(
    attempts: CorrelationExecutionAttempt[],
    request: ChangeRequestRow,
    payload: ReturnType<typeof parseChangeRequestPayload>,
    correlatedRows: ObservedEventRow[],
  ): CorrelationDiagnosticAttempt[] {
    const windows =
      attempts.length > 0
        ? attempts
        : [
            {
              startedAt: request.approved_at ?? request.submitted_at,
              finishedAt: request.executed_at ?? new Date(),
              executionResult: undefined,
            },
          ];
    const windowSeconds = this.getCorrelationWindowSeconds();

    return windows.map((attempt) => {
      const lowerBound = new Date(
        attempt.startedAt.getTime() - windowSeconds * 1000,
      );
      const upperBound = new Date(
        (attempt.finishedAt ?? new Date()).getTime() + windowSeconds * 1000,
      );

      return {
        startedAt: attempt.startedAt.toISOString(),
        finishedAt: attempt.finishedAt?.toISOString() ?? null,
        lowerBound: lowerBound.toISOString(),
        upperBound: upperBound.toISOString(),
        expectedSignals: getExpectedCorrelationSignals(
          payload,
          attempt.executionResult,
        ),
        matchedSignals: collectMatchedCorrelationSignals(
          correlatedRows.filter(
            (row) => row.event_time >= lowerBound && row.event_time <= upperBound,
          ),
          request,
          payload,
          attempt.executionResult,
        ),
      };
    });
  }

  private async mapDiagnosticObservedEvent(
    event: ObservedEventRow,
    request: ChangeRequestRow,
    attempts: CorrelationExecutionAttempt[],
    isCorrelatedToRequest: boolean,
  ): Promise<CorrelationDiagnosticObservedEvent> {
    const payload = parseChangeRequestPayload(request.request_data);
    const matchingAttempt = this.findMatchingAttemptForEvent(
      event,
      request,
      attempts,
    );
    const executionResult =
      matchingAttempt?.executionResult ?? attempts.at(-1)?.executionResult;
    const evaluation = matchingAttempt
      ? evaluateObservedEventForRequest(event, request, payload, executionResult)
      : {
          matches: false,
          reasonCodes: ['outside_time_window' as const],
          detectedSignals: [],
          matchedSignals: [],
        };
    const matchingRequestIds = await this.findMatchingRequestIdsForEvent(event);
    const correlationState =
      await this.getObservedEventCorrelationState(event.observed_event_id);
    const reasonCodes = new Set(evaluation.reasonCodes);

    if (matchingRequestIds.length > 1) {
      reasonCodes.add('ambiguous_request_match');
    }

    if (correlationState === 'matched' && !isCorrelatedToRequest) {
      reasonCodes.add('already_correlated');
    }

    return {
      observedEventId: event.observed_event_id,
      eventId: event.event_id,
      eventType: event.event_type,
      eventTime: event.event_time.toISOString(),
      title: event.title,
      distinguishedName: event.distinguished_name,
      samAccountName: event.sam_account_name,
      subjectAccountName: event.subject_account_name,
      correlationState,
      sourceReference: event.source_reference,
      detectedSignals: evaluation.detectedSignals,
      matchedSignals: evaluation.matchedSignals,
      reasonCodes: Array.from(reasonCodes),
      matchingRequestIds,
    };
  }

  private getCorrelationWindowSeconds(): number {
    return Number(process.env.CORRELATION_WINDOW_SECONDS ?? '60');
  }

  private async loadExecutionAttempts(
    requestId: string,
    currentExecution?: RequestExecutionRow,
  ): Promise<CorrelationExecutionAttempt[]> {
    const auditRows = await this.db
      .selectFrom('audit_log')
      .selectAll()
      .where('request_id', '=', requestId)
      .where('event_type', 'in', [
        'execution_started',
        'execution_finished',
        'execution_failed',
      ])
      .orderBy('created_at', 'asc')
      .execute();
    const attempts = this.buildAttemptsFromAuditRows(auditRows);

    if (
      currentExecution &&
      !attempts.some(
        (attempt) =>
          attempt.startedAt.getTime() === currentExecution.started_at.getTime(),
      )
    ) {
      attempts.push({
        startedAt: currentExecution.started_at,
        finishedAt: currentExecution.finished_at,
        executionResult: currentExecution.execution_result,
      });
    }

    return attempts.sort(
      (left, right) => left.startedAt.getTime() - right.startedAt.getTime(),
    );
  }

  private buildAttemptsFromAuditRows(
    rows: AuditLogRow[],
  ): CorrelationExecutionAttempt[] {
    const attempts: CorrelationExecutionAttempt[] = [];
    let current: CorrelationExecutionAttempt | null = null;

    for (const row of rows) {
      if (row.event_type === 'execution_started') {
        if (current) {
          attempts.push(current);
        }

        current = {
          startedAt: this.readDateFromAuditDetails(row, 'startedAt') ?? row.created_at,
          finishedAt: null,
          executionResult: undefined,
        };
        continue;
      }

      if (
        row.event_type !== 'execution_finished' &&
        row.event_type !== 'execution_failed'
      ) {
        continue;
      }

      if (!current) {
        const finishedAt =
          this.readDateFromAuditDetails(row, 'finishedAt') ?? row.created_at;
        current = {
          startedAt:
            this.readDateFromAuditDetails(row, 'startedAt') ?? finishedAt,
          finishedAt,
          executionResult: this.readExecutionResultFromAuditRow(row),
        };
        attempts.push(current);
        current = null;
        continue;
      }

      current.finishedAt =
        this.readDateFromAuditDetails(row, 'finishedAt') ?? row.created_at;
      current.executionResult = this.readExecutionResultFromAuditRow(row);
      attempts.push(current);
      current = null;
    }

    if (current) {
      attempts.push(current);
    }

    return attempts;
  }

  private readExecutionResultFromAuditRow(
    row: AuditLogRow,
  ): Record<string, unknown> | undefined {
    const raw = row.event_details.raw;

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }

    return raw as Record<string, unknown>;
  }

  private readDateFromAuditDetails(
    row: AuditLogRow,
    key: 'startedAt' | 'finishedAt',
  ): Date | undefined {
    const value = row.event_details[key];

    if (typeof value !== 'string') {
      return undefined;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}

type CorrelationExecutionAttempt = {
  startedAt: Date;
  finishedAt: Date | null;
  executionResult?: Record<string, unknown> | null;
};
