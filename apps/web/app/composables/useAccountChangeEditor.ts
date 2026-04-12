import { computed, reactive, ref, watch } from "vue";
import type {
  AccountChangeDirectorySnapshot,
  AccountChangePayload,
  DirectoryAccountView,
  DirectoryGroupSearchResult,
  DirectoryGroupView,
  DirectoryUserSearchHit,
  DirectoryUserSearchResult,
} from "@acam-ts/contracts";

import { useDirectoryTypeahead } from "./useDirectoryTypeahead";
import type { TypeaheadOption } from "../types/ui";
import { toErrorMessage } from "../utils/errors";
import {
  cloneGroup,
  formatGroupSelectionLabel,
  formatUserSelectionLabel,
  groupKey,
  groupsMatch,
} from "../utils/directory";
import {
  buildAccountAttributeChanges,
  normalizeDateTimeInput,
  normalizeFieldValue,
  sortDirectoryGroups,
  toDateTimeLocalValue,
} from "../utils/request-create";

export type AccountChangeFormState = {
  samAccountName: string;
  distinguishedName: string;
  objectGuid: string;
  objectSid: string;
  displayName: string;
  givenName: string;
  surname: string;
  userPrincipalName: string;
  mail: string;
  department: string;
  title: string;
  company: string;
  telephoneNumber: string;
  description: string;
  enabled: boolean;
  accountExpiresAt: string;
  desiredGroups: DirectoryGroupView[];
};

type GroupIdentityLike = {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
};

export function useAccountChangeEditor() {
  const form = reactive<AccountChangeFormState>({
    samAccountName: "",
    distinguishedName: "",
    objectGuid: "",
    objectSid: "",
    displayName: "",
    givenName: "",
    surname: "",
    userPrincipalName: "",
    mail: "",
    department: "",
    title: "",
    company: "",
    telephoneNumber: "",
    description: "",
    enabled: true,
    accountExpiresAt: "",
    desiredGroups: [],
  });

  const accountSnapshot = ref<AccountChangeDirectorySnapshot | null>(null);
  const targetUserQuery = ref("");
  const groupQuery = ref("");
  const accountLoad = reactive({
    loading: false,
    error: null as string | null,
  });

  const currentGroups = computed(
    () => accountSnapshot.value?.account.groupMemberships ?? [],
  );

  const groupsToAdd = computed(() =>
    form.desiredGroups.filter(
      (group) =>
        !currentGroups.value.some((currentGroup) =>
          groupsMatch(currentGroup, group),
        ),
    ),
  );

  const groupsToRemove = computed(() =>
    currentGroups.value.filter(
      (group) =>
        !form.desiredGroups.some((desiredGroup) =>
          groupsMatch(desiredGroup, group),
        ),
    ),
  );

  const selectedTargetUserLabel = computed(() =>
    accountSnapshot.value
      ? formatUserSelectionLabel(accountSnapshot.value.account)
      : null,
  );

  const userSearch = useDirectoryTypeahead<DirectoryUserSearchHit>(
    targetUserQuery,
    async (requestQuery) => {
      const response = await useApi<DirectoryUserSearchResult>(
        `/directory/users/search?query=${encodeURIComponent(requestQuery)}`,
      );

      return response.results;
    },
    {
      shouldSkip: (trimmedQuery) =>
        !!selectedTargetUserLabel.value &&
        trimmedQuery === selectedTargetUserLabel.value,
      fallbackError: "Failed to search Active Directory users.",
    },
  );

  const groupSearch = useDirectoryTypeahead<DirectoryGroupView>(
    groupQuery,
    async (requestQuery) => {
      const response = await useApi<DirectoryGroupSearchResult>(
        `/directory/groups/search?query=${encodeURIComponent(requestQuery)}`,
      );

      return response.results;
    },
    {
      fallbackError: "Failed to search Active Directory groups.",
    },
  );

  const userOptions = computed<TypeaheadOption[]>(() =>
    userSearch.results.map((user) => ({
      id: user.samAccountName,
      title: formatUserSelectionLabel({
        displayName: user.displayName,
        samAccountName: user.samAccountName,
      }),
      subtitle: user.userPrincipalName || user.samAccountName,
      meta: user.samAccountName,
    })),
  );

  const groupOptions = computed<TypeaheadOption[]>(() =>
    groupSearch.results.map((group) => ({
      id: groupKey(group),
      title: group.displayName || group.samAccountName || group.distinguishedName,
      subtitle: group.samAccountName,
      meta: group.distinguishedName,
    })),
  );

  const attributeChangesPreview = computed(() => {
    if (!accountSnapshot.value) {
      return [];
    }

    return buildAccountAttributeChanges(accountSnapshot.value, form);
  });

  watch(targetUserQuery, (query) => {
    if (accountSnapshot.value && query !== selectedTargetUserLabel.value) {
      clearLoadedAccountState(query);
    }
  });

  function clearLoadedAccountState(preservedQuery = "") {
    accountSnapshot.value = null;
    accountLoad.error = null;
    form.samAccountName = "";
    form.distinguishedName = "";
    form.objectGuid = "";
    form.objectSid = "";
    form.displayName = "";
    form.givenName = "";
    form.surname = "";
    form.userPrincipalName = "";
    form.mail = "";
    form.department = "";
    form.title = "";
    form.company = "";
    form.telephoneNumber = "";
    form.description = "";
    form.enabled = true;
    form.accountExpiresAt = "";
    form.desiredGroups = [];

    if (targetUserQuery.value !== preservedQuery) {
      targetUserQuery.value = preservedQuery;
    }
  }

  function applyLoadedAccount(account: DirectoryAccountView) {
    accountSnapshot.value = {
      loadedAt: new Date().toISOString(),
      account,
    };
    accountLoad.error = null;
    userSearch.error = null;
    userSearch.results = [];
    targetUserQuery.value = formatUserSelectionLabel(account);
    form.samAccountName = account.samAccountName;
    form.distinguishedName = account.distinguishedName;
    form.objectGuid = account.objectGuid ?? "";
    form.objectSid = account.objectSid ?? "";
    form.displayName = account.displayName ?? "";
    form.givenName = account.givenName ?? "";
    form.surname = account.surname ?? "";
    form.userPrincipalName = account.userPrincipalName ?? "";
    form.mail = account.mail ?? "";
    form.department = account.department ?? "";
    form.title = account.title ?? "";
    form.company = account.company ?? "";
    form.telephoneNumber = account.telephoneNumber ?? "";
    form.description = account.description ?? "";
    form.enabled = account.enabled ?? true;
    form.accountExpiresAt = toDateTimeLocalValue(account.accountExpiresAt);
    form.desiredGroups = account.groupMemberships.map(cloneGroup);
  }

  async function loadAccountFromDirectory(samAccountName: string) {
    accountLoad.loading = true;
    accountLoad.error = null;

    try {
      const account = await useApi<DirectoryAccountView>(
        `/directory/users/${encodeURIComponent(samAccountName)}`,
      );
      applyLoadedAccount(account);
    } catch (caught) {
      clearLoadedAccountState(targetUserQuery.value);
      accountLoad.error = toErrorMessage(
        caught,
        "Failed to load the account from Active Directory.",
      );
    } finally {
      accountLoad.loading = false;
    }
  }

  function handleTargetUserSelect(selectedId: string) {
    void loadAccountFromDirectory(selectedId);
  }

  function handleTargetUserBlur() {
    const trimmedQuery = targetUserQuery.value.trim().toLowerCase();

    if (!trimmedQuery || accountSnapshot.value || userSearch.loading) {
      return;
    }

    const exactMatch = userSearch.results.find((user) =>
      [
        user.samAccountName,
        user.displayName,
        user.userPrincipalName,
        formatUserSelectionLabel({
          displayName: user.displayName,
          samAccountName: user.samAccountName,
        }),
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase() === trimmedQuery),
    );

    if (exactMatch) {
      void loadAccountFromDirectory(exactMatch.samAccountName);
    }
  }

  function isDesiredGroup(group: DirectoryGroupView) {
    return form.desiredGroups.some((entry) => groupsMatch(entry, group));
  }

  function isCurrentGroupMarkedForRemoval(group: GroupIdentityLike) {
    return groupsToRemove.value.some((entry) => groupsMatch(entry, group));
  }

  function addDesiredGroup(group: DirectoryGroupView) {
    if (isDesiredGroup(group)) {
      return;
    }

    form.desiredGroups = sortDirectoryGroups([
      ...form.desiredGroups,
      cloneGroup(group),
    ]);
  }

  function handleGroupSelect(groupId: string) {
    const group = groupSearch.results.find((entry) => groupKey(entry) === groupId);

    if (!group) {
      return;
    }

    addDesiredGroup(group);
    groupQuery.value = "";
    groupSearch.results = [];
  }

  function removeDesiredGroup(group: GroupIdentityLike) {
    form.desiredGroups = form.desiredGroups.filter(
      (entry) => groupKey(entry) !== groupKey(group),
    );
  }

  function restoreGroupRemoval(group: GroupIdentityLike) {
    const existing = currentGroups.value.find((entry) => groupsMatch(entry, group));

    if (existing) {
      addDesiredGroup(existing);
    }
  }

  function toggleCurrentGroup(group: GroupIdentityLike) {
    if (isCurrentGroupMarkedForRemoval(group)) {
      restoreGroupRemoval(group);
      return;
    }

    removeDesiredGroup(group);
  }

  function currentGroupActionLabel(group: GroupIdentityLike) {
    return isCurrentGroupMarkedForRemoval(group) ? "Restore" : "Remove";
  }

  function getSnapshot() {
    if (!accountSnapshot.value) {
      throw new Error(
        "Select a target user from Active Directory before submitting an account change.",
      );
    }

    return {
      loadedAt: accountSnapshot.value.loadedAt,
      account: {
        ...accountSnapshot.value.account,
        groupMemberships:
          accountSnapshot.value.account.groupMemberships.map(cloneGroup),
      },
    };
  }

  function buildPayload(): AccountChangePayload {
    const snapshot = getSnapshot();
    const changes = buildAccountAttributeChanges(snapshot, form).map((change) => ({
      attribute: change.attribute,
      previousValue: change.previousValue,
      nextValue: change.nextValue,
    }));
    const groupChanges = [
      ...groupsToAdd.value.map((group) => ({
        operation: "add" as const,
        group: cloneGroup(group),
      })),
      ...groupsToRemove.value.map((group) => ({
        operation: "remove" as const,
        group: cloneGroup(group),
      })),
    ];

    if (changes.length === 0 && groupChanges.length === 0) {
      throw new Error(
        "No account or group changes were made compared with the loaded Active Directory snapshot.",
      );
    }

    return {
      kind: "account_change",
      target: {
        samAccountName: snapshot.account.samAccountName,
        displayName:
          normalizeFieldValue(form.displayName) ?? snapshot.account.displayName,
        distinguishedName: snapshot.account.distinguishedName,
        objectGuid: snapshot.account.objectGuid,
        objectSid: snapshot.account.objectSid,
      },
      changes,
      groupChanges,
      snapshot,
    };
  }

  return {
    form,
    accountSnapshot,
    accountLoad,
    targetUserQuery,
    groupQuery,
    userSearch,
    groupSearch,
    userOptions,
    groupOptions,
    currentGroups,
    groupsToAdd,
    groupsToRemove,
    attributeChangesPreview,
    handleTargetUserSelect,
    handleTargetUserBlur,
    handleGroupSelect,
    toggleCurrentGroup,
    currentGroupActionLabel,
    isCurrentGroupMarkedForRemoval,
    removeDesiredGroup,
    restoreGroupRemoval,
    buildPayload,
  };
}

export type AccountChangeEditorController = ReturnType<
  typeof useAccountChangeEditor
>;
