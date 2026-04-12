import type { Kysely } from 'kysely';
import { Inject, Injectable } from '@nestjs/common';

import type { ObservedEventsListView } from '@acam-ts/contracts';
import type { DatabaseSchema, JsonObject } from '../../common/database/schema';

import { DATABASE_TOKEN } from '../../common/database/database.constants';
import { AppLogService } from '../../common/logging/app-log.service';
import {
  sanitizeJsonForPostgres,
  sanitizePostgresNullableText,
  sanitizePostgresText,
} from '../../common/utils/postgres-json.utils';
import { CorrelationService } from '../correlation/correlation.service';
import { ObservedEventIngestDto } from './dto/observed-event-ingest.dto';

@Injectable()
export class ObservedEventsService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
    private readonly correlationService: CorrelationService,
    private readonly appLogService: AppLogService,
  ) {}

  async ingest(dto: ObservedEventIngestDto) {
    let observedEventId: number;
    const eventSource = sanitizePostgresText(dto.eventSource);
    const sourceSystem = sanitizePostgresText(dto.sourceSystem);
    const sourceReference = sanitizePostgresNullableText(dto.sourceReference);

    try {
      const inserted = await this.db
        .insertInto('observed_event')
        .values({
          event_source: eventSource,
          source_system: sourceSystem,
          source_reference: sourceReference,
          event_id: dto.eventId ?? null,
          event_time: new Date(dto.eventTime),
          event_type: sanitizePostgresNullableText(dto.eventType),
          title: sanitizePostgresNullableText(dto.title),
          message: sanitizePostgresNullableText(dto.message),
          object_guid: sanitizePostgresNullableText(dto.objectGuid),
          distinguished_name: sanitizePostgresNullableText(
            dto.distinguishedName,
          ),
          sam_account_name: sanitizePostgresNullableText(dto.samAccountName),
          subject_account_name: sanitizePostgresNullableText(
            dto.subjectAccountName,
          ),
          payload: sanitizeJsonForPostgres((dto.payload ?? {}) as JsonObject),
        })
        .returning('observed_event_id')
        .executeTakeFirstOrThrow();

      observedEventId = inserted.observed_event_id;
    } catch {
      const existing = await this.db
        .selectFrom('observed_event')
        .select('observed_event_id')
        .where('event_source', '=', eventSource)
        .where('source_system', '=', sourceSystem)
        .where(
          'source_reference',
          sourceReference ? '=' : 'is',
          sourceReference,
        )
        .executeTakeFirstOrThrow();

      observedEventId = existing.observed_event_id;
    }

    this.appLogService.info(
      'observed-events',
      'Observed technical event ingested.',
      {
        observedEventId,
        eventSource: dto.eventSource,
        sourceSystem: dto.sourceSystem,
        sourceReference: dto.sourceReference ?? null,
      },
    );

    await this.correlationService.correlateObservedEvent(observedEventId);

    return this.getById(observedEventId);
  }

  async list(
    page: number,
    pageSize: number,
    options?: { unmatchedOnly?: boolean },
  ): Promise<ObservedEventsListView> {
    const normalizedPageSize = Math.max(1, Math.min(pageSize, 200));
    const unmatchedOnly = options?.unmatchedOnly ?? false;
    const totalEntries = unmatchedOnly
      ? Number(
          (
            await this.db
              .selectFrom('observed_event as oe')
              .leftJoin(
                'event_correlation as ec',
                'ec.observed_event_id',
                'oe.observed_event_id',
              )
              .where('ec.observed_event_id', 'is', null)
              .select(({ fn }) => fn.countAll<number>().as('count'))
              .executeTakeFirstOrThrow()
          ).count ?? 0,
        )
      : Number(
          (
            await this.db
              .selectFrom('observed_event as oe')
              .select(({ fn }) => fn.countAll<number>().as('count'))
              .executeTakeFirstOrThrow()
          ).count ?? 0,
        );
    const totalPages = Math.max(1, Math.ceil(totalEntries / normalizedPageSize));
    const normalizedPage = Math.max(1, Math.min(page, totalPages));
    const rows = unmatchedOnly
      ? await this.db
          .selectFrom('observed_event as oe')
          .leftJoin(
            'event_correlation as ec',
            'ec.observed_event_id',
            'oe.observed_event_id',
          )
          .where('ec.observed_event_id', 'is', null)
          .selectAll('oe')
          .orderBy('oe.created_at', 'desc')
          .orderBy('oe.observed_event_id', 'desc')
          .limit(normalizedPageSize)
          .offset((normalizedPage - 1) * normalizedPageSize)
          .execute()
      : await this.db
          .selectFrom('observed_event as oe')
          .selectAll('oe')
          .orderBy('oe.created_at', 'desc')
          .orderBy('oe.observed_event_id', 'desc')
          .limit(normalizedPageSize)
          .offset((normalizedPage - 1) * normalizedPageSize)
          .execute();

    return {
      entries: await Promise.all(
        rows.map((row) => this.mapRow(row)),
      ),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalEntries,
      totalPages,
      hasNextPage: normalizedPage < totalPages,
      hasPreviousPage: normalizedPage > 1,
    };
  }

  async getById(observedEventId: number) {
    const row = await this.db
      .selectFrom('observed_event')
      .selectAll()
      .where('observed_event_id', '=', observedEventId)
      .executeTakeFirstOrThrow();

    return this.mapRow(row);
  }

  async listUnmatched(
    page: number,
    pageSize: number,
  ): Promise<ObservedEventsListView> {
    return this.list(page, pageSize, { unmatchedOnly: true });
  }

  private async mapRow(row: {
    observed_event_id: number;
    event_source: string;
    source_system: string;
    source_reference: string | null;
    event_id: number | null;
    event_time: Date;
    event_type: string | null;
    title: string | null;
    message: string | null;
    object_guid: string | null;
    distinguished_name: string | null;
    sam_account_name: string | null;
    subject_account_name: string | null;
    payload: Record<string, unknown>;
    created_at: Date;
  }) {
    const matchedRequest = await this.db
      .selectFrom('event_correlation as ec')
      .innerJoin('change_request as cr', 'cr.request_id', 'ec.request_id')
      .select([
        'cr.request_id as requestId',
        'cr.request_number as requestNumber',
        'cr.title as title',
        'cr.status as status',
      ])
      .where('ec.observed_event_id', '=', row.observed_event_id)
      .orderBy('ec.correlated_at', 'asc')
      .executeTakeFirst();

    return {
      observedEventId: row.observed_event_id,
      eventSource: row.event_source,
      sourceSystem: row.source_system,
      sourceReference: row.source_reference,
      eventId: row.event_id,
      eventTime: row.event_time.toISOString(),
      eventType: row.event_type,
      title: row.title,
      message: row.message,
      objectGuid: row.object_guid,
      distinguishedName: row.distinguished_name,
      samAccountName: row.sam_account_name,
      subjectAccountName: row.subject_account_name,
      payload: row.payload,
      createdAt: row.created_at.toISOString(),
      correlationState:
        await this.correlationService.getObservedEventCorrelationState(
          row.observed_event_id,
        ),
      matchedRequest: matchedRequest
        ? {
            requestId: matchedRequest.requestId,
            requestNumber: matchedRequest.requestNumber,
            title: matchedRequest.title,
            status: matchedRequest.status,
          }
        : null,
    };
  }
}
