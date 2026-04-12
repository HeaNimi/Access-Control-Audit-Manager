import type {
  AuthUserSearchHit,
  DirectoryAccountView,
  DirectoryGroupDetailView,
  DirectoryGroupMemberView,
  DirectoryGroupView,
} from "@acam-ts/contracts";

type GroupIdentityLike = Pick<
  DirectoryGroupView,
  "distinguishedName" | "samAccountName" | "displayName" | "objectGuid"
>;

type MemberIdentityLike = Pick<
  DirectoryGroupMemberView,
  "distinguishedName" | "samAccountName" | "displayName" | "objectGuid"
>;

export function normalizeSamPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

export function buildSuggestedSamAccountName(
  givenName: string,
  surname: string,
) {
  const left = normalizeSamPart(givenName);
  const right = normalizeSamPart(surname);

  return [left, right].filter(Boolean).join(".");
}

export function formatUserSelectionLabel(
  user: Pick<DirectoryAccountView, "displayName" | "samAccountName">,
) {
  return user.displayName
    ? `${user.displayName} (${user.samAccountName})`
    : user.samAccountName;
}

export function formatApproverSelectionLabel(
  approver: Pick<AuthUserSearchHit, "displayName" | "username">,
) {
  return approver.displayName
    ? `${approver.displayName} (${approver.username})`
    : approver.username;
}

export function formatGroupSelectionLabel(
  group: Pick<DirectoryGroupDetailView, "displayName" | "samAccountName">,
) {
  return group.displayName && group.displayName !== group.samAccountName
    ? `${group.displayName} (${group.samAccountName})`
    : (group.samAccountName ?? group.displayName ?? "");
}

export function groupKey(group: GroupIdentityLike) {
  return (
    group.objectGuid ??
    group.samAccountName?.toLowerCase() ??
    group.displayName?.toLowerCase() ??
    group.distinguishedName?.toLowerCase() ??
    "group"
  );
}

export function memberKey(member: MemberIdentityLike) {
  return (
    member.objectGuid ??
    member.samAccountName?.toLowerCase() ??
    member.displayName?.toLowerCase() ??
    member.distinguishedName?.toLowerCase() ??
    "member"
  );
}

export function groupsMatch(left: GroupIdentityLike, right: GroupIdentityLike) {
  return groupKey(left) === groupKey(right);
}

export function membersMatch(
  left: MemberIdentityLike,
  right: MemberIdentityLike,
) {
  return memberKey(left) === memberKey(right);
}

export function cloneGroup(group: DirectoryGroupView): DirectoryGroupView {
  return {
    distinguishedName: group.distinguishedName,
    samAccountName: group.samAccountName,
    displayName: group.displayName,
    objectGuid: group.objectGuid,
    objectSid: group.objectSid,
  };
}

export function cloneMember(
  member: Pick<
    DirectoryGroupMemberView,
    | "distinguishedName"
    | "samAccountName"
    | "displayName"
    | "objectGuid"
    | "objectSid"
    | "memberType"
  >,
): DirectoryGroupMemberView {
  return {
    distinguishedName: member.distinguishedName,
    samAccountName: member.samAccountName,
    displayName: member.displayName,
    objectGuid: member.objectGuid,
    objectSid: member.objectSid,
    memberType: member.memberType,
  };
}
