import type {
  AccountChangePayload,
  ChangeRequestPayload,
  DirectoryGroupMemberView,
  DirectoryGroupView,
  GroupChangePayload,
  UserCreatePayload,
} from "@acam-ts/contracts";
import type { KeyValueItem } from "../types/ui";

import { presentEnabledState, presentExpiryValue, presentValue } from "./display";

export function getRequestedGroups(
  payload: AccountChangePayload | null | undefined,
  operation: "add" | "remove",
): DirectoryGroupView[] {
  return (payload?.groupChanges ?? [])
    .filter((change) => change.operation === operation)
    .map((change) => change.group);
}

export function getRequestedMembers(
  payload: GroupChangePayload | null | undefined,
  operation: "add" | "remove",
): DirectoryGroupMemberView[] {
  return (payload?.memberChanges ?? [])
    .filter((change) => change.operation === operation)
    .map((change) => change.member);
}

export function buildGroupSnapshotFields(
  payload: GroupChangePayload | null | undefined,
): KeyValueItem[] {
  if (!payload?.snapshot) {
    return [];
  }

  return [
    {
      label: "sAMAccountName",
      value: payload.snapshot.group.samAccountName || "Not set",
      mono: true,
    },
    {
      label: "Display name",
      value: presentValue(payload.snapshot.group.displayName),
    },
    {
      label: "Description",
      value: presentValue(payload.snapshot.group.description),
    },
  ];
}

export function buildUserCreateFields(
  payload: UserCreatePayload | null | undefined,
): KeyValueItem[] {
  if (!payload) {
    return [];
  }

  return [
    {
      label: "Display name",
      value: presentValue(payload.target.displayName),
    },
    {
      label: "sAMAccountName",
      value: payload.target.samAccountName,
      mono: true,
    },
    {
      label: "Given name",
      value: presentValue(payload.target.givenName),
    },
    {
      label: "Surname",
      value: presentValue(payload.target.surname),
    },
    {
      label: "User principal name",
      value: presentValue(payload.target.userPrincipalName),
    },
    {
      label: "Email",
      value: presentValue(payload.target.mail),
    },
    {
      label: "Enabled",
      value: presentEnabledState(payload.target.enabled ?? true),
    },
    {
      label: "Account expiry",
      value: presentExpiryValue(payload.target.accountExpiresAt),
    },
    {
      label: "Temporary password",
      value: "[redacted]",
    },
    {
      label: "Description",
      value: presentValue(payload.target.description),
      colSpanClass: "md:col-span-2 xl:col-span-3",
    },
  ];
}

export function redactRequestPayload(
  payload: ChangeRequestPayload | null | undefined,
): ChangeRequestPayload | null {
  if (!payload) {
    return null;
  }

  if (payload.kind === "user_create" && payload.target.password) {
    return {
      ...payload,
      target: {
        ...payload.target,
        password: "[redacted]",
      },
    };
  }

  return payload;
}
