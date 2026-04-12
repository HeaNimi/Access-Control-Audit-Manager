import type { DirectoryAccountView, DirectoryGroupDetailView, DirectoryObjectRef } from "./directory";
import type { ObservedEventView } from "./observed-events";
import type { PaginatedEntriesView } from "./pagination";
import type { ChangeRequestSummary, RequestTimelineItem } from "./requests";

export type AuditObjectType = "user" | "group";

export interface AuditObjectRef extends DirectoryObjectRef {
  objectType: AuditObjectType;
  samAccountName: string;
  distinguishedName?: string;
  displayName?: string;
}

export interface AuditLogView {
  auditLogId: number;
  eventType: string;
  actorDisplayName: string | null;
  actorUsername: string | null;
  actorRole: string;
  entityType: string;
  entityId: string | null;
  message: string | null;
  eventDetails: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogsView extends PaginatedEntriesView<AuditLogView> {}

export interface AuditObjectView {
  object: AuditObjectRef;
  currentAccount: DirectoryAccountView | null;
  currentGroup: DirectoryGroupDetailView | null;
  relatedRequests: ChangeRequestSummary[];
  timeline: RequestTimelineItem[];
  auditTrail: AuditLogView[];
  observedEvents: ObservedEventView[];
}
