import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { Injectable } from '@nestjs/common';

import type { RuntimeHealthCheck } from '@acam-ts/contracts';

import { toErrorMessage } from '../../common/utils/error.utils';
import { DirectoryService } from '../directory/directory.service';
import {
  type ElasticHit,
  type ElasticWinlogbeatNormalizationResult,
  normalizeElasticWinlogbeatHit,
} from './elastic-winlogbeat-normalizer';
import { ELASTIC_WINLOGBEAT_DRIVER_KEY } from './siem.constants';
import type {
  SiemCursor,
  SiemDriver,
  SiemFetchedEvent,
  SiemFetchResult,
  SiemNormalizationRejectCounts,
  SiemNormalizationRejectReason,
  SiemSourceConfig,
} from './siem.types';
import { coerceSortValues } from './siem.utils';

@Injectable()
export class ElasticWinlogbeatDriver implements SiemDriver {
  readonly key = ELASTIC_WINLOGBEAT_DRIVER_KEY;

  private readonly memberSamAccountNameCache = new Map<string, string | null>();
  private readonly accountDistinguishedNameCache = new Map<string, string | null>();
  private readonly groupDistinguishedNameCache = new Map<string, string | null>();

  constructor(private readonly directoryService: DirectoryService) {}

  async getHealth(source: SiemSourceConfig): Promise<RuntimeHealthCheck> {
    if (!source.node || !source.apiKey) {
      return {
        key: 'siem',
        label: 'SIEM / Elasticsearch',
        status: 'warning',
        detail:
          'Elasticsearch pull is configured incompletely. Set ELASTICSEARCH_NODE and ELASTICSEARCH_API_KEY.',
      };
    }

    const client = this.createClient(source);

    try {
      const clusterInfo = await client.info();
      const aggregationResponse = await client.search({
        index: source.index,
        size: 0,
        track_total_hits: false,
        query: {
          bool: {
            filter: [
              {
                range: {
                  '@timestamp': {
                    gte: `now-${source.healthLookbackSeconds}s`,
                  },
                },
              },
              {
                terms: {
                  'event.code': source.eventIds.map(String),
                },
              },
            ],
          },
        },
        aggs: {
          codes: {
            terms: {
              field: 'event.code',
              size: source.eventIds.length,
            },
          },
        },
      });

      const buckets = ((
        aggregationResponse as {
          aggregations?: {
            codes?: { buckets?: Array<{ key: string; doc_count: number }> };
          };
        }
      ).aggregations?.codes?.buckets ?? []) as Array<{
        key: string;
        doc_count: number;
      }>;
      const bucketCounts = new Map(
        buckets.map((bucket) => [Number(bucket.key), bucket.doc_count]),
      );
      const missingEventIds = source.eventIds.filter(
        (eventId) => !bucketCounts.get(eventId),
      );
      const totalMatches = Array.from(bucketCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      );

      return {
        key: 'siem',
        label: 'SIEM / Elasticsearch',
        status:
          totalMatches === 0 || missingEventIds.length > 0
            ? 'warning'
            : 'healthy',
        detail: [
          `Connected to Elasticsearch ${clusterInfo.version.number} on ${source.node}.`,
          `${totalMatches} matching event(s) in the last ${Math.floor(source.healthLookbackSeconds / 3600)} hour(s).`,
          missingEventIds.length > 0
            ? `Missing configured event IDs: ${missingEventIds.join(', ')}.`
            : 'All configured event IDs have recent matches.',
        ].join(' '),
      };
    } catch (error) {
      return {
        key: 'siem',
        label: 'SIEM / Elasticsearch',
        status: 'error',
        detail: toErrorMessage(
          error,
          'Elasticsearch connection or health query failed.',
        ),
      };
    }
  }

  async fetchBatch(
    source: SiemSourceConfig,
    cursor: SiemCursor,
    limit: number,
  ): Promise<SiemFetchResult> {
    const client = this.createClient(source);
    const keepAlive = '1m';
    let pitId = cursor.runtimeState?.pitId;
    const now = new Date();
    const maxTimestamp = new Date(
      now.getTime() + source.maxFutureSkewSeconds * 1000,
    ).toISOString();
    const effectiveGte =
      cursor.runtimeState?.effectiveGte ??
      getEffectiveQueryLowerBound(source, cursor, now);
    const isFirstPage = !pitId;
    const skippedCheckpointSearchAfter =
      isFirstPage &&
      source.pollOverlapSeconds > 0 &&
      !!cursor.lastSort?.values.length;
    const searchAfter = isFirstPage
      ? skippedCheckpointSearchAfter
        ? undefined
        : cursor.lastSort?.values
      : cursor.runtimeState?.searchAfter?.values;

    try {
      if (!pitId) {
        const pit = await client.openPointInTime({
          index: source.index,
          keep_alive: keepAlive,
        });
        pitId = pit.id;
      }

      const response = await client.search({
        size: limit,
        track_total_hits: false,
        pit: {
          id: pitId,
          keep_alive: keepAlive,
        },
        sort: [
          {
            '@timestamp': {
              order: 'asc',
              format: 'strict_date_optional_time_nanos',
            },
          },
          {
            _shard_doc: {
              order: 'asc',
            },
          },
        ],
        search_after: searchAfter,
        query: {
          bool: {
            filter: [
              {
                range: {
                  '@timestamp': {
                    gte: effectiveGte,
                    lte: maxTimestamp,
                  },
                },
              },
              {
                terms: {
                  'event.code': source.eventIds.map(String),
                },
              },
              {
                term: {
                  'winlog.channel': 'Security',
                },
              },
            ],
          },
        },
      });

      const hits = ((response.hits.hits ?? []) as ElasticHit[]).filter(Boolean);
      const events: SiemFetchedEvent[] = [];
      const warnings: string[] = [];
      const normalizationRejectCounts: SiemNormalizationRejectCounts = {};

      for (const hit of hits) {
        const normalized = await this.normalize(source, hit, cursor);

        if (normalized.status === 'rejected') {
          incrementRejectCount(normalizationRejectCounts, normalized.reason);
          continue;
        }

        events.push(normalized.event);
      }

      const lastEvent = events.at(-1);
      const lastHit = hits.at(-1);
      const hasMore = hits.length === limit;
      const highWaterCursor = advanceHighWaterCursor(
        cursor,
        lastEvent ?? null,
      );
      const nextCursor: SiemCursor = {
        lastEventTime: highWaterCursor.lastEventTime,
        lastSourceReference: highWaterCursor.lastSourceReference,
        lastSort: highWaterCursor.lastSort,
        runtimeState: hasMore
          ? {
              pitId,
              searchAfter: lastHit?.sort
                ? {
                    values: coerceSortValues(lastHit.sort),
                  }
                : (cursor.runtimeState?.searchAfter ?? null),
              overlapApplied: source.pollOverlapSeconds > 0,
              effectiveGte,
              checkpointLastEventTime:
                cursor.runtimeState?.checkpointLastEventTime ??
                cursor.lastEventTime ??
                null,
              skippedCheckpointSearchAfter,
            }
          : null,
      };

      if (!hasMore) {
        await this.disposePit(client, pitId);
      }

      if (events.length === 0 && hits.length > 0) {
        warnings.push(
          'Fetched events but none could be normalized into observed events.',
        );
      }

      return {
        events,
        fetchedHitCount: hits.length,
        hasMore,
        nextCursor,
        warnings,
        queryDiagnostics: {
          pollOverlapSeconds: source.pollOverlapSeconds,
          effectiveGte,
          checkpointLastEventTime:
            cursor.runtimeState?.checkpointLastEventTime ??
            cursor.lastEventTime ??
            null,
          skippedCheckpointSearchAfter,
        },
        normalizationRejectCounts:
          Object.keys(normalizationRejectCounts).length > 0
            ? normalizationRejectCounts
            : undefined,
      };
    } catch (error) {
      if (pitId) {
        await this.disposePit(client, pitId);
      }

      throw error;
    }
  }

  async disposeCursor(
    source: SiemSourceConfig,
    cursor: SiemCursor,
  ): Promise<void> {
    const pitId = cursor.runtimeState?.pitId;

    if (!pitId) {
      return;
    }

    await this.disposePit(this.createClient(source), pitId);
  }

  private createClient(source: SiemSourceConfig): ElasticsearchClient {
    return new ElasticsearchClient({
      node: source.node,
      auth: {
        apiKey: source.apiKey ?? '',
      },
      tls: {
        rejectUnauthorized: source.tlsRejectUnauthorized,
      },
    });
  }

  private async normalize(
    source: SiemSourceConfig,
    hit: ElasticHit,
    cursor: SiemCursor,
  ): Promise<ElasticWinlogbeatNormalizationResult> {
    return normalizeElasticWinlogbeatHit({
      source,
      hit,
      cursor,
      resolveSamAccountNameFromDistinguishedName: (distinguishedName) =>
        this.resolveSamAccountNameFromDistinguishedName(distinguishedName),
      resolveAccountDistinguishedNameBySamAccountName: (samAccountName) =>
        this.resolveAccountDistinguishedNameBySamAccountName(samAccountName),
      resolveGroupDistinguishedNameBySamAccountName: (samAccountName) =>
        this.resolveGroupDistinguishedNameBySamAccountName(samAccountName),
    });
  }

  private async resolveSamAccountNameFromDistinguishedName(
    distinguishedName: string | undefined,
  ): Promise<string | null> {
    if (!distinguishedName) {
      return null;
    }

    const cacheKey = distinguishedName.toLowerCase();

    if (this.memberSamAccountNameCache.has(cacheKey)) {
      return this.memberSamAccountNameCache.get(cacheKey) ?? null;
    }

    try {
      const account =
        await this.directoryService.getAccountByDistinguishedName(
          distinguishedName,
        );
      const samAccountName = account.samAccountName ?? null;
      this.memberSamAccountNameCache.set(cacheKey, samAccountName);
      return samAccountName;
    } catch {
      this.memberSamAccountNameCache.set(cacheKey, null);
      return null;
    }
  }

  private async resolveAccountDistinguishedNameBySamAccountName(
    samAccountName: string | undefined,
  ): Promise<string | null> {
    if (!samAccountName) {
      return null;
    }

    const cacheKey = samAccountName.trim().toLowerCase();

    if (this.accountDistinguishedNameCache.has(cacheKey)) {
      return this.accountDistinguishedNameCache.get(cacheKey) ?? null;
    }

    try {
      const account =
        await this.directoryService.getAccountBySamAccountName(samAccountName);
      const distinguishedName = account.distinguishedName ?? null;
      this.accountDistinguishedNameCache.set(cacheKey, distinguishedName);
      return distinguishedName;
    } catch {
      this.accountDistinguishedNameCache.set(cacheKey, null);
      return null;
    }
  }

  private async resolveGroupDistinguishedNameBySamAccountName(
    samAccountName: string | undefined,
  ): Promise<string | null> {
    if (!samAccountName) {
      return null;
    }

    const cacheKey = samAccountName.trim().toLowerCase();

    if (this.groupDistinguishedNameCache.has(cacheKey)) {
      return this.groupDistinguishedNameCache.get(cacheKey) ?? null;
    }

    try {
      const group =
        await this.directoryService.getGroupBySamAccountName(samAccountName);
      const distinguishedName = group.distinguishedName ?? null;
      this.groupDistinguishedNameCache.set(cacheKey, distinguishedName);
      return distinguishedName;
    } catch {
      this.groupDistinguishedNameCache.set(cacheKey, null);
      return null;
    }
  }

  private async disposePit(
    client: ElasticsearchClient,
    pitId: string,
  ): Promise<void> {
    try {
      await client.closePointInTime({
        id: pitId,
      });
    } catch {
      return;
    }
  }
}

function incrementRejectCount(
  counts: SiemNormalizationRejectCounts,
  reason: SiemNormalizationRejectReason,
): void {
  counts[reason] = (counts[reason] ?? 0) + 1;
}

function getEffectiveQueryLowerBound(
  source: SiemSourceConfig,
  cursor: SiemCursor,
  now: Date,
): string {
  const initialLookbackStart = new Date(
    now.getTime() - source.initialLookbackSeconds * 1000,
  );
  const checkpointTime = cursor.lastEventTime
    ? new Date(cursor.lastEventTime)
    : null;
  const boundedCheckpointTime =
    checkpointTime && !Number.isNaN(checkpointTime.getTime())
      ? new Date(Math.min(checkpointTime.getTime(), now.getTime()))
      : null;
  const overlappedCheckpointTime = boundedCheckpointTime
    ? new Date(
        boundedCheckpointTime.getTime() - source.pollOverlapSeconds * 1000,
      )
    : null;
  const lowerBound = new Date(
    Math.max(
      initialLookbackStart.getTime(),
      overlappedCheckpointTime?.getTime() ?? initialLookbackStart.getTime(),
    ),
  );

  return lowerBound.toISOString();
}

function advanceHighWaterCursor(
  cursor: SiemCursor,
  event: SiemFetchedEvent | null,
): Pick<SiemCursor, 'lastEventTime' | 'lastSourceReference' | 'lastSort'> {
  if (!event) {
    return {
      lastEventTime: cursor.lastEventTime,
      lastSourceReference: cursor.lastSourceReference,
      lastSort: cursor.lastSort ?? null,
    };
  }

  const currentTime = cursor.lastEventTime
    ? new Date(cursor.lastEventTime).getTime()
    : Number.NEGATIVE_INFINITY;
  const eventTime = new Date(event.observedEvent.eventTime).getTime();

  if (Number.isNaN(eventTime) || eventTime < currentTime) {
    return {
      lastEventTime: cursor.lastEventTime,
      lastSourceReference: cursor.lastSourceReference,
      lastSort: cursor.lastSort ?? null,
    };
  }

  return {
    lastEventTime: event.observedEvent.eventTime,
    lastSourceReference: event.observedEvent.sourceReference ?? null,
    lastSort: event.sort,
  };
}
