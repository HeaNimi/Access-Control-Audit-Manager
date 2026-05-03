export type SiemNormalizationRejectReason =
  | "missing_source_or_timestamp"
  | "cursor_duplicate"
  | "unsupported_event_id"
  | "outside_scope";

export type SiemNormalizationRejectCounts = Partial<
  Record<SiemNormalizationRejectReason, number>
>;

export interface SiemPollSourceResultView {
  sourceKey: string;
  driverKey: string;
  status: "success" | "error" | "skipped";
  fetchedCount: number;
  storedCount: number;
  warningCount: number;
  warnings: string[];
  normalizationRejectCounts?: SiemNormalizationRejectCounts;
  lastEventTime?: string | null;
  lastSourceReference?: string | null;
  error?: string | null;
}

export interface SiemPollSummaryView {
  trigger: "startup" | "interval" | "manual";
  startedAt: string;
  finishedAt: string;
  sourceResults: SiemPollSourceResultView[];
}
