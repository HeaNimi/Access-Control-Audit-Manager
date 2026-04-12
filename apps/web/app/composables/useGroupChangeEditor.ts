import { computed, reactive, ref, watch } from "vue";
import type {
  DirectoryGroupDetailView,
  DirectoryGroupMemberView,
  DirectoryGroupSearchResult,
  DirectoryGroupView,
  DirectoryUserSearchHit,
  DirectoryUserSearchResult,
  GroupChangeDirectorySnapshot,
  GroupChangePayload,
} from "@acam-ts/contracts";

import { useDirectoryTypeahead } from "./useDirectoryTypeahead";
import type { TypeaheadOption } from "../types/ui";
import { toErrorMessage } from "../utils/errors";
import {
  cloneMember,
  formatGroupSelectionLabel,
  groupKey,
  memberKey,
  membersMatch,
} from "../utils/directory";
import { sortDirectoryMembers } from "../utils/request-create";

export type GroupChangeFormState = {
  samAccountName: string;
  distinguishedName: string;
  objectGuid: string;
  objectSid: string;
  displayName: string;
  desiredMembers: DirectoryGroupMemberView[];
};

type MemberIdentityLike = Pick<
  DirectoryGroupMemberView,
  "distinguishedName" | "samAccountName" | "displayName" | "objectGuid"
>;

export function useGroupChangeEditor() {
  const form = reactive<GroupChangeFormState>({
    samAccountName: "",
    distinguishedName: "",
    objectGuid: "",
    objectSid: "",
    displayName: "",
    desiredMembers: [],
  });

  const groupSnapshot = ref<GroupChangeDirectorySnapshot | null>(null);
  const targetGroupQuery = ref("");
  const memberQuery = ref("");
  const groupLoad = reactive({
    loading: false,
    error: null as string | null,
  });

  const selectedTargetGroupLabel = computed(() =>
    groupSnapshot.value
      ? formatGroupSelectionLabel(groupSnapshot.value.group)
      : null,
  );

  const currentGroupMembers = computed(() =>
    (groupSnapshot.value?.group.members ?? []).filter(
      (member) => (member.memberType ?? "user") === "user",
    ),
  );

  const membersToAdd = computed(() =>
    form.desiredMembers.filter(
      (member) =>
        !currentGroupMembers.value.some((currentMember) =>
          membersMatch(currentMember, member),
        ),
    ),
  );

  const membersToRemove = computed(() =>
    currentGroupMembers.value.filter(
      (member) =>
        !form.desiredMembers.some((desiredMember) =>
          membersMatch(desiredMember, member),
        ),
    ),
  );

  const groupTargetSearch = useDirectoryTypeahead<DirectoryGroupView>(
    targetGroupQuery,
    async (requestQuery) => {
      const response = await useApi<DirectoryGroupSearchResult>(
        `/directory/groups/search?query=${encodeURIComponent(requestQuery)}`,
      );

      return response.results;
    },
    {
      shouldSkip: (trimmedQuery) =>
        !!selectedTargetGroupLabel.value &&
        trimmedQuery === selectedTargetGroupLabel.value,
      fallbackError: "Failed to search Active Directory groups.",
    },
  );

  const memberSearch = useDirectoryTypeahead<DirectoryUserSearchHit>(
    memberQuery,
    async (requestQuery) => {
      const response = await useApi<DirectoryUserSearchResult>(
        `/directory/users/search?query=${encodeURIComponent(requestQuery)}`,
      );

      return response.results;
    },
    {
      fallbackError: "Failed to search Active Directory users.",
    },
  );

  const targetGroupOptions = computed<TypeaheadOption[]>(() =>
    groupTargetSearch.results.map((group) => ({
      id: group.samAccountName ?? groupKey(group),
      title: formatGroupSelectionLabel({
        displayName: group.displayName,
        samAccountName: group.samAccountName,
      } as DirectoryGroupDetailView),
      subtitle: group.samAccountName,
      meta: group.distinguishedName,
    })),
  );

  const memberOptions = computed<TypeaheadOption[]>(() =>
    memberSearch.results.map((user) => ({
      id: user.samAccountName,
      title: user.displayName || user.samAccountName,
      subtitle: user.userPrincipalName || user.samAccountName,
      meta: user.samAccountName,
    })),
  );

  watch(targetGroupQuery, (query) => {
    if (groupSnapshot.value && query !== selectedTargetGroupLabel.value) {
      clearLoadedGroupState(query);
    }
  });

  function clearLoadedGroupState(preservedQuery = "") {
    groupSnapshot.value = null;
    groupLoad.error = null;
    form.samAccountName = "";
    form.distinguishedName = "";
    form.objectGuid = "";
    form.objectSid = "";
    form.displayName = "";
    form.desiredMembers = [];

    if (targetGroupQuery.value !== preservedQuery) {
      targetGroupQuery.value = preservedQuery;
    }
  }

  function applyLoadedGroup(group: DirectoryGroupDetailView) {
    groupSnapshot.value = {
      loadedAt: new Date().toISOString(),
      group,
    };
    groupLoad.error = null;
    groupTargetSearch.error = null;
    groupTargetSearch.results = [];
    targetGroupQuery.value = formatGroupSelectionLabel(group);
    form.samAccountName = group.samAccountName ?? "";
    form.distinguishedName = group.distinguishedName;
    form.objectGuid = group.objectGuid ?? "";
    form.objectSid = group.objectSid ?? "";
    form.displayName = group.displayName ?? group.samAccountName ?? "";
    form.desiredMembers = group.members
      .filter((member) => (member.memberType ?? "user") === "user")
      .map(cloneMember);
  }

  async function loadGroupFromDirectory(samAccountName: string) {
    groupLoad.loading = true;
    groupLoad.error = null;

    try {
      const group = await useApi<DirectoryGroupDetailView>(
        `/directory/groups/${encodeURIComponent(samAccountName)}`,
      );
      applyLoadedGroup(group);
    } catch (caught) {
      clearLoadedGroupState(targetGroupQuery.value);
      groupLoad.error = toErrorMessage(
        caught,
        "Failed to load the group from Active Directory.",
      );
    } finally {
      groupLoad.loading = false;
    }
  }

  function handleTargetGroupSelect(selectedId: string) {
    void loadGroupFromDirectory(selectedId);
  }

  function handleTargetGroupBlur() {
    const trimmedQuery = targetGroupQuery.value.trim().toLowerCase();

    if (!trimmedQuery || groupSnapshot.value || groupTargetSearch.loading) {
      return;
    }

    const exactMatch = groupTargetSearch.results.find((group) =>
      [
        group.samAccountName,
        group.displayName,
        formatGroupSelectionLabel({
          displayName: group.displayName,
          samAccountName: group.samAccountName,
        } as DirectoryGroupDetailView),
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase() === trimmedQuery),
    );

    if (exactMatch?.samAccountName) {
      void loadGroupFromDirectory(exactMatch.samAccountName);
    }
  }

  function isDesiredMember(member: MemberIdentityLike) {
    return form.desiredMembers.some((entry) => membersMatch(entry, member));
  }

  function addDesiredMember(member: MemberIdentityLike) {
    if (!member.samAccountName || !member.distinguishedName || isDesiredMember(member)) {
      return;
    }

    form.desiredMembers = sortDirectoryMembers([
      ...form.desiredMembers,
      cloneMember({
        ...member,
        distinguishedName: member.distinguishedName,
        samAccountName: member.samAccountName,
        memberType: "user",
      }),
    ]);
  }

  function handleMemberSelect(selectedId: string) {
    const member = memberSearch.results.find(
      (entry) => entry.samAccountName === selectedId,
    );

    if (!member) {
      return;
    }

    addDesiredMember(member);
    memberQuery.value = "";
    memberSearch.results = [];
  }

  function removeDesiredMember(member: MemberIdentityLike) {
    form.desiredMembers = form.desiredMembers.filter(
      (entry) => memberKey(entry) !== memberKey(member),
    );
  }

  function isCurrentMemberMarkedForRemoval(member: MemberIdentityLike) {
    return membersToRemove.value.some((entry) => membersMatch(entry, member));
  }

  function restoreDesiredMember(member: MemberIdentityLike) {
    const existing = currentGroupMembers.value.find((entry) =>
      membersMatch(entry, member),
    );

    if (existing) {
      addDesiredMember(existing);
    }
  }

  function toggleCurrentMember(member: MemberIdentityLike) {
    if (isCurrentMemberMarkedForRemoval(member)) {
      restoreDesiredMember(member);
      return;
    }

    removeDesiredMember(member);
  }

  function currentMemberActionLabel(member: MemberIdentityLike) {
    return isCurrentMemberMarkedForRemoval(member) ? "Restore" : "Remove";
  }

  function buildPayload(): GroupChangePayload {
    if (!groupSnapshot.value) {
      throw new Error(
        "Select a target group from Active Directory before submitting a group change.",
      );
    }

    const memberChanges = [
      ...membersToAdd.value.map((member) => ({
        operation: "add" as const,
        member: {
          samAccountName: member.samAccountName ?? "",
          distinguishedName: member.distinguishedName,
          displayName: member.displayName,
          objectGuid: member.objectGuid,
          objectSid: member.objectSid,
        },
      })),
      ...membersToRemove.value.map((member) => ({
        operation: "remove" as const,
        member: {
          samAccountName: member.samAccountName ?? "",
          distinguishedName: member.distinguishedName,
          displayName: member.displayName,
          objectGuid: member.objectGuid,
          objectSid: member.objectSid,
        },
      })),
    ];

    if (memberChanges.length === 0) {
      throw new Error(
        "No group membership changes were made compared with the loaded Active Directory snapshot.",
      );
    }

    return {
      kind: "group_change",
      target: {
        samAccountName: groupSnapshot.value.group.samAccountName ?? "",
        distinguishedName: groupSnapshot.value.group.distinguishedName,
        displayName:
          groupSnapshot.value.group.displayName ??
          groupSnapshot.value.group.samAccountName,
        objectGuid: groupSnapshot.value.group.objectGuid,
        objectSid: groupSnapshot.value.group.objectSid,
      },
      memberChanges,
      snapshot: {
        loadedAt: groupSnapshot.value.loadedAt,
        group: {
          ...groupSnapshot.value.group,
          members: groupSnapshot.value.group.members.map(cloneMember),
        },
      },
    };
  }

  return {
    form,
    groupSnapshot,
    groupLoad,
    targetGroupQuery,
    memberQuery,
    groupTargetSearch,
    memberSearch,
    targetGroupOptions,
    memberOptions,
    currentGroupMembers,
    membersToAdd,
    membersToRemove,
    handleTargetGroupSelect,
    handleTargetGroupBlur,
    handleMemberSelect,
    toggleCurrentMember,
    currentMemberActionLabel,
    isCurrentMemberMarkedForRemoval,
    removeDesiredMember,
    restoreDesiredMember,
    buildPayload,
  };
}

export type GroupChangeEditorController = ReturnType<
  typeof useGroupChangeEditor
>;
