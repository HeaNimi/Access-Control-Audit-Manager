import type {
  ObservedEventIngestDto,
  RuntimeHealthCheck,
  SiemNormalizationRejectCounts,
  SiemNormalizationRejectReason,
  SiemPollSourceResultView,
  SiemPollSummaryView,
} from '@acam-ts/contracts';

export interface SiemSortState {
  values: Array<number | string>;
}

export interface SiemRuntimeCursorState {
  pitId?: string;
  searchAfter?: SiemSortState | null;
  overlapApplied?: boolean;
  effectiveGte?: string;
  checkpointLastEventTime?: string | null;
  skippedCheckpointSearchAfter?: boolean;
}

export interface SiemCursor {
  lastEventTime?: string | null;
  lastSort?: SiemSortState | null;
  lastSourceReference?: string | null;
  runtimeState?: SiemRuntimeCursorState | null;
}

export interface SiemSourceConfig {
  sourceKey: string;
  driverKey: string;
  enabled: boolean;
  node: string;
  apiKey?: string;
  index: string;
  tlsRejectUnauthorized: boolean;
  eventIds: number[];
  sourceSystem: string;
  scopeBaseDn?: string;
  initialLookbackSeconds: number;
  pollOverlapSeconds: number;
  healthLookbackSeconds: number;
  maxFutureSkewSeconds: number;
}

export interface SiemFetchedEvent {
  observedEvent: ObservedEventIngestDto;
  sort: SiemSortState | null;
}

export interface SiemFetchResult {
  events: SiemFetchedEvent[];
  fetchedHitCount: number;
  hasMore: boolean;
  nextCursor: SiemCursor;
  warnings: string[];
  queryDiagnostics?: SiemFetchQueryDiagnostics;
  normalizationRejectCounts?: SiemNormalizationRejectCounts;
}

export interface SiemFetchQueryDiagnostics {
  pollOverlapSeconds: number;
  effectiveGte: string;
  checkpointLastEventTime: string | null;
  skippedCheckpointSearchAfter: boolean;
}

export type { SiemNormalizationRejectCounts, SiemNormalizationRejectReason };

export interface SiemDriver {
  readonly key: string;

  getHealth(source: SiemSourceConfig): Promise<RuntimeHealthCheck>;

  fetchBatch(
    source: SiemSourceConfig,
    cursor: SiemCursor,
    limit: number,
  ): Promise<SiemFetchResult>;

  disposeCursor?(source: SiemSourceConfig, cursor: SiemCursor): Promise<void>;
}

export interface SiemSourcePollResult extends SiemPollSourceResultView {
  sourceKey: string;
  driverKey: string;
  status: 'success' | 'error' | 'skipped';
  fetchedCount: number;
  storedCount: number;
  warningCount: number;
  warnings: string[];
  normalizationRejectCounts?: SiemNormalizationRejectCounts;
  lastEventTime?: string | null;
  lastSourceReference?: string | null;
  error?: string | null;
}

export interface SiemPollSummary extends SiemPollSummaryView {
  trigger: 'startup' | 'interval' | 'manual';
  startedAt: string;
  finishedAt: string;
  sourceResults: SiemSourcePollResult[];
}
