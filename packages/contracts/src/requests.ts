import type { AuthenticatedUserProfile } from "./auth";
import type {
  DirectoryAccountView,
  DirectoryGroupDetailView,
  DirectoryObjectRef,
} from "./directory";
import type { AuditLogView } from "./audit";
import type { EventCorrelationView, ObservedEventView } from "./observed-events";

export const REQUEST_TYPES = [
  "user_create",
  "account_change",
  "group_change",
  "account_update",
  "group_membership_add",
  "group_membership_remove",
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "executing",
  "executed",
  "failed",
  "closed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const CORRELATION_STATES = [
  "pending",
  "matched",
  "rejected",
  "missing",
  "ambiguous",
  "out_of_band",
] as const;
export type CorrelationState = (typeof CORRELATION_STATES)[number];

export interface UserCreatePayload {
  kind: "user_create";
  target: DirectoryObjectRef & {
    samAccountName: string;
    displayName: string;
    givenName: string;
    surname: string;
    userPrincipalName?: string;
    ouDistinguishedName?: string;
    mail?: string;
    password?: string;
    enabled?: boolean;
    accountExpiresAt?: string | null;
    description?: string | null;
  };
  initialGroups?: DirectoryObjectRef[];
}

export interface AccountAttributeChange {
  attribute: string;
  previousValue?: string | null;
  nextValue: string | null;
}

export interface AccountUpdatePayload {
  kind: "account_update";
  target: DirectoryObjectRef & {
    samAccountName: string;
  };
  changes: AccountAttributeChange[];
}

export interface AccountGroupChange {
  operation: "add" | "remove";
  group: DirectoryObjectRef & {
    distinguishedName?: string;
    samAccountName?: string;
    displayName?: string;
  };
}

export interface AccountChangeDirectorySnapshot {
  loadedAt: string;
  account: DirectoryAccountView;
}

export interface AccountChangePayload {
  kind: "account_change";
  target: DirectoryObjectRef & {
    samAccountName: string;
  };
  changes?: AccountAttributeChange[];
  groupChanges?: AccountGroupChange[];
  snapshot?: AccountChangeDirectorySnapshot;
}

export interface GroupChangeDirectorySnapshot {
  loadedAt: string;
  group: DirectoryGroupDetailView;
}

export interface GroupMemberChange {
  operation: "add" | "remove";
  member: DirectoryObjectRef & {
    samAccountName: string;
  };
}

export interface GroupChangePayload {
  kind: "group_change";
  target: DirectoryObjectRef & {
    samAccountName: string;
  };
  memberChanges: GroupMemberChange[];
  snapshot?: GroupChangeDirectorySnapshot;
}

export interface GroupMembershipPayload {
  kind: "group_membership_add" | "group_membership_remove";
  group: DirectoryObjectRef & {
    distinguishedName?: string;
    samAccountName?: string;
    displayName?: string;
  };
  member: DirectoryObjectRef & {
    samAccountName: string;
  };
}

export type ChangeRequestPayload =
  | UserCreatePayload
  | AccountChangePayload
  | GroupChangePayload
  | AccountUpdatePayload
  | GroupMembershipPayload;

export interface ChangeRequestCreateDto {
  title: string;
  justification: string;
  approverUsername: string;
  payload: ChangeRequestPayload;
}

export interface ApprovalDecisionDto {
  decision: "approved" | "rejected";
  decisionComment?: string;
}

export interface ChangeRequestSummary {
  requestId: string;
  requestNumber: number;
  requestType: RequestType;
  status: RequestStatus;
  title: string;
  justification: string;
  requesterDisplayName: string;
  approverDisplayName: string | null;
  targetSummary: string;
  correlationState: CorrelationState;
  submittedAt: string;
  approvedAt: string | null;
  executedAt: string | null;
}

export interface RequestApprovalView {
  approvalId: string;
  approverUserId: string;
  approverDisplayName: string;
  approverUsername: string;
  decision: "approved" | "rejected" | null;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface RequestExecutionView {
  executionId: string;
  executionStatus: "executing" | "executed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  executionResult: Record<string, unknown>;
}

export interface ChangeRequestDetail extends ChangeRequestSummary {
  requester: AuthenticatedUserProfile;
  payload: ChangeRequestPayload;
  approvals: RequestApprovalView[];
  execution: RequestExecutionView | null;
  auditTrail: AuditLogView[];
  observedEvents: ObservedEventView[];
  correlations: EventCorrelationView[];
}

export interface RequestTimelineItem {
  id: string;
  kind:
    | "request_submitted"
    | "approval_decided"
    | "execution_started"
    | "execution_finished"
    | "audit_log"
    | "observed_event"
    | "correlation";
  timestamp: string;
  title: string;
  message?: string;
  status?: string;
  actor?: string;
  meta?: Record<string, unknown>;
}

export const GROUP_MEMBERSHIP_REQUEST_TYPES: RequestType[] = [
  "group_membership_add",
  "group_membership_remove",
];

export function isGroupMembershipRequest(
  payload: ChangeRequestPayload,
): payload is GroupMembershipPayload {
  return (
    payload.kind === "group_membership_add" ||
    payload.kind === "group_membership_remove"
  );
}

export function getTargetSummary(payload: ChangeRequestPayload): string {
  switch (payload.kind) {
    case "user_create":
      return `${payload.target.displayName} (${payload.target.samAccountName})`;
    case "account_change": {
      const attributeCount = payload.changes?.length ?? 0;
      const groupCount = payload.groupChanges?.length ?? 0;
      return `${payload.target.displayName ?? payload.target.samAccountName} (${payload.target.samAccountName}) · ${attributeCount} attribute change(s), ${groupCount} group change(s)`;
    }
    case "group_change": {
      const memberCount = payload.memberChanges?.length ?? 0;
      return `${payload.target.displayName ?? payload.target.samAccountName} (${payload.target.samAccountName}) · ${memberCount} member change(s)`;
    }
    case "account_update":
      return `${payload.target.displayName ?? payload.target.samAccountName} (${payload.target.samAccountName})`;
    case "group_membership_add":
      return `${payload.member.samAccountName} -> ${payload.group.displayName ?? payload.group.samAccountName ?? payload.group.distinguishedName ?? "group"}`;
    case "group_membership_remove":
      return `${payload.member.samAccountName} -/-> ${payload.group.displayName ?? payload.group.samAccountName ?? payload.group.distinguishedName ?? "group"}`;
  }
}
