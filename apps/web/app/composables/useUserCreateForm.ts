import { computed, reactive, ref, watch, type Ref } from "vue";
import type {
  AuthenticatedUserProfile,
  DirectoryGroupSearchResult,
  DirectoryGroupView,
  UserCreationTemplateView,
  UserCreatePayload,
} from "@acam-ts/contracts";

import { useDirectoryTypeahead } from "./useDirectoryTypeahead";
import type { TypeaheadOption } from "../types/ui";
import {
  buildSuggestedSamAccountName,
  cloneGroup,
  groupKey,
  groupsMatch,
} from "../utils/directory";
import {
  buildPendingCreationDescription,
  generateSimplePassword,
  normalizeDateTimeInput,
  normalizeFieldValue,
  sortDirectoryGroups,
  toDateTimeLocalValue,
} from "../utils/request-create";

export type UserCreateDefaultsState = {
  samAccountName: boolean;
  displayName: boolean;
  userPrincipalName: boolean;
  mail: boolean;
  description: boolean;
};

export type UserCreateFormState = {
  samAccountName: string;
  displayName: string;
  givenName: string;
  surname: string;
  userPrincipalName: string;
  mail: string;
  password: string;
  enabled: boolean;
  accountExpiresAt: string;
  description: string;
  ouDistinguishedName: string;
  initialGroups: DirectoryGroupView[];
};

export function useUserCreateForm(input: {
  user: Ref<AuthenticatedUserProfile | null>;
  defaultUpnSuffix: Ref<string>;
  defaultMailDomain: Ref<string>;
  defaultUsersOuDn: Ref<string>;
}) {
  const createdDescriptionTimestamp = new Date();
  const defaults = reactive<UserCreateDefaultsState>({
    samAccountName: false,
    displayName: false,
    userPrincipalName: false,
    mail: false,
    description: false,
  });
  const selectedTemplate = ref<UserCreationTemplateView | null>(null);
  const upnSuffixOverride = ref("");
  const mailDomainOverride = ref("");
  const effectiveUpnSuffix = computed(
    () => upnSuffixOverride.value || input.defaultUpnSuffix.value,
  );
  const effectiveMailDomain = computed(
    () => mailDomainOverride.value || input.defaultMailDomain.value,
  );

  const form = reactive<UserCreateFormState>({
    samAccountName: "",
    displayName: "",
    givenName: "",
    surname: "",
    userPrincipalName: "",
    mail: "",
    password: generateSimplePassword(),
    enabled: true,
    accountExpiresAt: "",
    description: buildPendingCreationDescription(
      input.user.value,
      createdDescriptionTimestamp,
    ),
    ouDistinguishedName: input.defaultUsersOuDn.value,
    initialGroups: [],
  });

  const groupQuery = ref("");

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

  const groupOptions = computed<TypeaheadOption[]>(() =>
    groupSearch.results.map((group) => ({
      id: groupKey(group),
      title:
        group.displayName || group.samAccountName || group.distinguishedName,
      subtitle: group.samAccountName,
      meta: group.distinguishedName,
    })),
  );

  watch(
    () => [form.givenName, form.surname],
    ([givenName, surname]) => {
      if (!defaults.samAccountName) {
        form.samAccountName = buildSuggestedSamAccountName(givenName, surname);
      }

      if (!defaults.displayName) {
        form.displayName = [givenName, surname]
          .filter(Boolean)
          .join(" ")
          .trim();
      }
    },
    { immediate: true },
  );

  watch(
    () => [
      form.samAccountName,
      effectiveUpnSuffix.value,
      effectiveMailDomain.value,
    ],
    ([samAccountName, upnSuffix, mailDomain]) => {
      const suggestedPrincipal = samAccountName
        ? `${samAccountName}@${upnSuffix}`
        : "";
      const suggestedMail = samAccountName
        ? `${samAccountName}@${mailDomain}`
        : "";

      if (!defaults.userPrincipalName) {
        form.userPrincipalName = suggestedPrincipal;
      }

      if (!defaults.mail) {
        form.mail = suggestedMail;
      }
    },
    { immediate: true },
  );

  watch(
    () => input.user.value,
    () => {
      if (!defaults.description) {
        form.description = buildPendingCreationDescription(
          input.user.value,
          createdDescriptionTimestamp,
        );
      }
    },
    { immediate: true },
  );

  watch(
    () => input.defaultUsersOuDn.value,
    (defaultUsersOuDn) => {
      form.ouDistinguishedName = defaultUsersOuDn;
    },
  );

  function markDefaultAsManual(field: keyof UserCreateDefaultsState) {
    defaults[field] = true;
  }

  function regeneratePassword() {
    form.password = generateSimplePassword();
  }

  function applyTemplate(template: UserCreationTemplateView | null) {
    selectedTemplate.value = template;
    upnSuffixOverride.value = template?.upnSuffix ?? "";
    mailDomainOverride.value = template?.mailDomain ?? "";
    form.ouDistinguishedName =
      template?.ouDistinguishedName ?? input.defaultUsersOuDn.value;
    form.enabled = template?.enabledDefault ?? true;
    form.accountExpiresAt = template?.accountExpiresOffsetDays
      ? toDateTimeLocalValue(
          new Date(
            Date.now() +
              template.accountExpiresOffsetDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
        )
      : "";
    form.description =
      template?.descriptionTemplate ??
      buildPendingCreationDescription(
        input.user.value,
        createdDescriptionTimestamp,
      );
    form.initialGroups = sortDirectoryGroups(
      (template?.groups ?? []).map(cloneGroup),
    );

    if (form.samAccountName) {
      form.userPrincipalName = `${form.samAccountName}@${effectiveUpnSuffix.value}`;
      form.mail = `${form.samAccountName}@${effectiveMailDomain.value}`;
    }

    defaults.userPrincipalName = false;
    defaults.mail = false;
    defaults.description = false;
  }

  function isInitialGroup(group: DirectoryGroupView) {
    return form.initialGroups.some((entry) => groupsMatch(entry, group));
  }

  function addInitialGroup(group: DirectoryGroupView) {
    if (isInitialGroup(group)) {
      return;
    }

    form.initialGroups = sortDirectoryGroups([
      ...form.initialGroups,
      cloneGroup(group),
    ]);
  }

  function handleGroupSelect(groupId: string) {
    const group = groupSearch.results.find(
      (entry) => groupKey(entry) === groupId,
    );

    if (!group) {
      return;
    }

    addInitialGroup(group);
    groupQuery.value = "";
    groupSearch.results = [];
  }

  function removeInitialGroup(group: {
    distinguishedName?: string;
    samAccountName?: string;
    displayName?: string;
    objectGuid?: string;
  }) {
    form.initialGroups = form.initialGroups.filter(
      (entry) => groupKey(entry) !== groupKey(group),
    );
  }

  function buildPayload(): UserCreatePayload {
    return {
      kind: "user_create",
      template: selectedTemplate.value
        ? {
            templateId: selectedTemplate.value.templateId,
            templateName: selectedTemplate.value.templateName,
            templateVersion: selectedTemplate.value.templateVersion,
          }
        : undefined,
      target: {
        samAccountName: form.samAccountName,
        displayName: form.displayName,
        givenName: form.givenName,
        surname: form.surname,
        userPrincipalName: form.userPrincipalName || undefined,
        mail: form.mail || undefined,
        password: form.password || undefined,
        enabled: form.enabled,
        accountExpiresAt:
          normalizeDateTimeInput(form.accountExpiresAt) ?? undefined,
        description: normalizeFieldValue(form.description) ?? undefined,
        ouDistinguishedName: form.ouDistinguishedName || undefined,
      },
      initialGroups: form.initialGroups.map(cloneGroup),
    };
  }

  return {
    form,
    defaults,
    groupQuery,
    groupSearch,
    groupOptions,
    selectedTemplate,
    markDefaultAsManual,
    applyTemplate,
    regeneratePassword,
    handleGroupSelect,
    removeInitialGroup,
    buildPayload,
  };
}

export type UserCreateFormController = ReturnType<typeof useUserCreateForm>;
