import type { Kysely } from 'kysely';
import { Inject, Injectable } from '@nestjs/common';

import type {
  DatabaseSchema,
  SiemSourceCheckpointRow,
} from '../../common/database/schema';

import { DATABASE_TOKEN } from '../../common/database/database.constants';
import type { SiemCursor, SiemSortState, SiemSourceConfig } from './siem.types';

@Injectable()
export class SiemCheckpointRepository {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
  ) {}

  async getOrCreate(
    source: SiemSourceConfig,
  ): Promise<SiemSourceCheckpointRow> {
    const existing = await this.db
      .selectFrom('siem_source_checkpoint')
      .selectAll()
      .where('source_key', '=', source.sourceKey)
      .executeTakeFirst();

    if (existing) {
      if (
        existing.driver_key !== source.driverKey ||
        existing.enabled !== source.enabled
      ) {
        await this.db
          .updateTable('siem_source_checkpoint')
          .set({
            driver_key: source.driverKey,
            enabled: source.enabled,
            updated_at: new Date(),
          })
          .where('source_key', '=', source.sourceKey)
          .execute();

        return {
          ...existing,
          driver_key: source.driverKey,
          enabled: source.enabled,
        };
      }

      return existing;
    }

    return this.db
      .insertInto('siem_source_checkpoint')
      .values({
        source_key: source.sourceKey,
        driver_key: source.driverKey,
        enabled: source.enabled,
        last_event_time: null,
        last_sort: null,
        last_source_reference: null,
        last_success_at: null,
        last_error_at: null,
        last_error_message: null,
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  toCursor(
    checkpoint: SiemSourceCheckpointRow,
    source: SiemSourceConfig,
  ): SiemCursor {
    const initialCursorTime = new Date(
      Date.now() - source.initialLookbackSeconds * 1000,
    ).toISOString();
    const maxAllowedCheckpointTime = new Date(
      Date.now() + source.maxFutureSkewSeconds * 1000,
    );
    const lastEventTime =
      checkpoint.last_event_time &&
      checkpoint.last_event_time.getTime() <= maxAllowedCheckpointTime.getTime()
        ? checkpoint.last_event_time.toISOString()
        : initialCursorTime;
    const shouldResetPosition =
      checkpoint.last_event_time != null &&
      checkpoint.last_event_time.getTime() > maxAllowedCheckpointTime.getTime();

    return {
      lastEventTime,
      lastSort: shouldResetPosition
        ? null
        : this.parseStoredSort(checkpoint.last_sort),
      lastSourceReference: shouldResetPosition
        ? null
        : checkpoint.last_source_reference,
      runtimeState: null,
    };
  }

  async updateSuccess(
    source: SiemSourceConfig,
    cursor: SiemCursor,
  ): Promise<void> {
    await this.db
      .updateTable('siem_source_checkpoint')
      .set({
        driver_key: source.driverKey,
        enabled: source.enabled,
        last_event_time: cursor.lastEventTime
          ? new Date(cursor.lastEventTime)
          : null,
        last_sort: this.toStoredSort(cursor.lastSort),
        last_source_reference: cursor.lastSourceReference ?? null,
        last_success_at: new Date(),
        last_error_at: null,
        last_error_message: null,
        updated_at: new Date(),
      })
      .where('source_key', '=', source.sourceKey)
      .execute();
  }

  async updateError(
    source: SiemSourceConfig,
    errorMessage: string,
    cursor: SiemCursor,
  ): Promise<void> {
    await this.db
      .updateTable('siem_source_checkpoint')
      .set({
        driver_key: source.driverKey,
        enabled: source.enabled,
        last_event_time: cursor.lastEventTime
          ? new Date(cursor.lastEventTime)
          : null,
        last_sort: this.toStoredSort(cursor.lastSort),
        last_source_reference: cursor.lastSourceReference ?? null,
        last_error_at: new Date(),
        last_error_message: errorMessage,
        updated_at: new Date(),
      })
      .where('source_key', '=', source.sourceKey)
      .execute();
  }

  describe(checkpoint: SiemSourceCheckpointRow): string {
    if (checkpoint.last_error_at) {
      return ` Last poll error at ${checkpoint.last_error_at.toISOString()}: ${checkpoint.last_error_message ?? 'Unknown error'}.`;
    }

    if (checkpoint.last_success_at) {
      return ` Last poll success at ${checkpoint.last_success_at.toISOString()}.`;
    }

    return ' No successful polls yet.';
  }

  private parseStoredSort(value: unknown): SiemSortState | null {
    if (
      !value ||
      typeof value !== 'object' ||
      !Array.isArray((value as { values?: unknown }).values)
    ) {
      return null;
    }

    const values = (value as { values: unknown[] }).values.filter(
      (entry): entry is number | string =>
        typeof entry === 'number' || typeof entry === 'string',
    );

    return values.length > 0 ? { values } : null;
  }

  private toStoredSort(sort: SiemSortState | null | undefined) {
    return sort ? { values: sort.values } : null;
  }
}
