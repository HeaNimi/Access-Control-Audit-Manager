import type { PaginatedEntriesView } from "./pagination";

export interface RuntimeHealthCheck {
  key: string;
  label: string;
  status: "healthy" | "warning" | "error";
  detail: string;
}

export interface RuntimeConfigEntry {
  key: string;
  value: string;
  redacted?: boolean;
}

export interface RuntimeConfigSection {
  key: string;
  label: string;
  entries: RuntimeConfigEntry[];
}

export interface SettingsRuntimeView {
  environment: string;
  appVersion: string;
  startedAt: string;
  uptimeSeconds: number;
  health: RuntimeHealthCheck[];
  configSections: RuntimeConfigSection[];
}

export interface ApplicationLogEntryView {
  timestamp: string;
  level: "log" | "warn" | "error" | "debug" | "verbose";
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ApplicationLogsView
  extends PaginatedEntriesView<ApplicationLogEntryView> {
  path: string;
}
