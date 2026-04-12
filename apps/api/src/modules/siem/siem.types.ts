import type {
  ObservedEventIngestDto,
  RuntimeHealthCheck,
} from '@acam-ts/contracts';

export interface SiemSortState {
  values: Array<number | string>;
}

export interface SiemRuntimeCursorState {
  pitId?: string;
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
  healthLookbackSeconds: number;
  maxFutureSkewSeconds: number;
}

export interface SiemFetchedEvent {
  observedEvent: ObservedEventIngestDto;
  sort: SiemSortState | null;
}

export interface SiemFetchResult {
  events: SiemFetchedEvent[];
  hasMore: boolean;
  nextCursor: SiemCursor;
  warnings: string[];
}

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

export interface SiemSourcePollResult {
  sourceKey: string;
  driverKey: string;
  status: 'success' | 'error' | 'skipped';
  fetchedCount: number;
  storedCount: number;
  warningCount: number;
  warnings: string[];
  lastEventTime?: string | null;
  lastSourceReference?: string | null;
  error?: string | null;
}

export interface SiemPollSummary {
  trigger: 'startup' | 'interval' | 'manual';
  startedAt: string;
  finishedAt: string;
  sourceResults: SiemSourcePollResult[];
}
