import type {
  ChangeRequestPayload,
  CorrelationState,
  RequestStatus,
} from "@acam-ts/contracts";

export function requestTypeLabel(type: string) {
  switch (type) {
    case "user_create":
      return "User creation";
    case "account_change":
      return "Account change";
    case "group_change":
      return "Group change";
    case "account_update":
      return "Account update";
    case "group_membership_add":
      return "Group membership add";
    case "group_membership_remove":
      return "Group membership remove";
    default:
      return type;
  }
}

export function requestStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export interface StateBadge {
  label: string;
  color:
    | "error"
    | "primary"
    | "secondary"
    | "success"
    | "info"
    | "warning"
    | "neutral";
  variant: "solid" | "outline" | "soft" | "subtle" | "ghost" | "link";
}

export function stateBadge(
  value: RequestStatus | CorrelationState | string | null | undefined,
): StateBadge {
  const normalized = (value ?? "unknown").toLowerCase().replaceAll(" ", "_");

  switch (normalized) {
    case "approved":
    case "executed":
    case "matched":
    case "healthy":
      return {
        label: normalized.replaceAll("_", " "),
        color: "success",
        variant: "subtle",
      };
    case "rejected":
    case "failed":
    case "out_of_band":
    case "error":
      return {
        label: normalized.replaceAll("_", " "),
        color: "error",
        variant: "subtle",
      };
    case "missing":
    case "pending":
    case "submitted":
    case "executing":
      return {
        label: normalized.replaceAll("_", " "),
        color: "warning",
        variant: "subtle",
      };
    case "draft":
    case "closed":
      return {
        label: normalized.replaceAll("_", " "),
        color: "neutral",
        variant: "soft",
      };
    default:
      return {
        label: normalized.replaceAll("_", " "),
        color: "neutral",
        variant: "soft",
      };
  }
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

export function buildTargetSummary(payload: ChangeRequestPayload) {
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
