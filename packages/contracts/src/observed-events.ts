import type { CorrelationState } from "./requests";
import type { PaginatedEntriesView } from "./pagination";

export interface ObservedEventIngestDto {
  eventSource: string;
  sourceSystem: string;
  sourceReference?: string | null;
  eventId?: number | null;
  eventTime: string;
  eventType?: string | null;
  title?: string | null;
  message?: string | null;
  objectGuid?: string | null;
  distinguishedName?: string | null;
  samAccountName?: string | null;
  subjectAccountName?: string | null;
  payload?: Record<string, unknown>;
}

export interface ObservedEventView {
  observedEventId: number;
  eventSource: string;
  sourceSystem: string;
  sourceReference: string | null;
  eventId: number | null;
  eventTime: string;
  eventType: string | null;
  title: string | null;
  message: string | null;
  objectGuid: string | null;
  distinguishedName: string | null;
  samAccountName: string | null;
  subjectAccountName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  correlationState: CorrelationState;
  matchedRequest: {
    requestId: string;
    requestNumber: number;
    title: string;
    status: string;
  } | null;
}

export interface ObservedEventsListView
  extends PaginatedEntriesView<ObservedEventView> {}

export interface EventCorrelationView {
  correlationId: number;
  observedEventId: number | null;
  auditLogId: number | null;
  note: string | null;
  correlatedAt: string;
}
