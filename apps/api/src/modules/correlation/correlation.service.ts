import type { Kysely } from 'kysely';
import { Inject, Injectable } from '@nestjs/common';

import type { CorrelationState, RequestStatus } from '@acam-ts/contracts';
import type {
  ChangeRequestRow,
  DatabaseSchema,
  ObservedEventRow,
  RequestExecutionRow,
} from '../../common/database/schema';

import { DATABASE_TOKEN } from '../../common/database/database.constants';
import {
  collectMatchedCorrelationSignals,
  doesObservedEventMatchRequest,
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

    const execution = await this.db
      .selectFrom('request_execution')
      .selectAll()
      .where('request_id', '=', requestId)
      .executeTakeFirst();

    const candidates = await this.findCandidateObservedEventsForRequest(
      request,
      execution,
    );

    for (const event of candidates) {
      const matchingRequests = await this.findMatchingRequestIdsForEvent(event);

      if (matchingRequests.length === 1 && matchingRequests[0] === requestId) {
        await this.createEventCorrelation(
          requestId,
          event.observed_event_id,
          'Matched by request workflow',
        );
      }
    }
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
    const execution = await this.db
      .selectFrom('request_execution')
      .selectAll()
      .where('request_id', '=', requestId)
      .executeTakeFirst();
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
      const expectedSignals = getExpectedCorrelationSignals(
        payload,
        execution?.execution_result,
      );
      const matchedSignals = new Set(
        collectMatchedCorrelationSignals(
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
    execution?: RequestExecutionRow,
  ): Promise<ObservedEventRow[]> {
    const windowSeconds = Number(
      process.env.CORRELATION_WINDOW_SECONDS ?? '60',
    );
    const lowerBound = new Date(
      (
        execution?.started_at ??
        request.approved_at ??
        request.submitted_at
      ).getTime() -
        windowSeconds * 1000,
    );
    const upperBound = new Date(
      (execution?.finished_at ?? request.executed_at ?? new Date()).getTime() +
        windowSeconds * 1000,
    );

    const payload = parseChangeRequestPayload(request.request_data);
    const expectedEventIds = getExpectedEventIds(request.request_type, payload);
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

    return rows.filter((row) =>
      doesObservedEventMatchRequest(
        row,
        request,
        payload,
        execution?.execution_result,
      ),
    );
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
      const execution = await this.db
        .selectFrom('request_execution')
        .selectAll()
        .where('request_id', '=', request.request_id)
        .executeTakeFirst();

      if (!this.isWithinTimeWindow(event.event_time, request, execution)) {
        continue;
      }

      const payload = parseChangeRequestPayload(request.request_data);

      if (
        doesObservedEventMatchRequest(
          event,
          request,
          payload,
          execution?.execution_result,
        )
      ) {
        matches.push(request.request_id);
      }
    }

    return matches;
  }

  private isWithinTimeWindow(
    eventTime: Date,
    request: ChangeRequestRow,
    execution?: RequestExecutionRow,
  ): boolean {
    const windowSeconds = Number(
      process.env.CORRELATION_WINDOW_SECONDS ?? '60',
    );
    const lowerBound = new Date(
      (
        execution?.started_at ??
        request.approved_at ??
        request.submitted_at
      ).getTime() -
        windowSeconds * 1000,
    );
    const upperBound = new Date(
      (execution?.finished_at ?? request.executed_at ?? new Date()).getTime() +
        windowSeconds * 1000,
    );

    return eventTime >= lowerBound && eventTime <= upperBound;
  }
}
