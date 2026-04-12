<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type {
  AuthUserSearchHit,
  AuthUserSearchResult,
  ChangeRequestDetail,
} from "@acam-ts/contracts";

import { useAccountChangeEditor } from "../../composables/useAccountChangeEditor";
import { useDirectoryTypeahead } from "../../composables/useDirectoryTypeahead";
import { useGroupChangeEditor } from "../../composables/useGroupChangeEditor";
import { useUserCreateForm } from "../../composables/useUserCreateForm";
import { toErrorMessage } from "../../utils/errors";
import { formatApproverSelectionLabel } from "../../utils/directory";

definePageMeta({
  middleware: "auth",
});

const runtimeConfig = useRuntimeConfig();
const toast = useToast();
const { user, ensureHydrated } = useAuth();

ensureHydrated();

const defaultUpnSuffix = computed(
  () => runtimeConfig.public.defaultUpnSuffix || "example.local",
);
const defaultMailDomain = computed(
  () => runtimeConfig.public.defaultMailDomain || defaultUpnSuffix.value,
);

const requestDetails = reactive({
  kind: "user_create" as "user_create" | "account_change" | "group_change",
  title: "",
  justification: "",
  approverUsername: "",
});

const submitting = ref(false);
const approverQuery = ref("");
const selectedApprover = ref<AuthUserSearchHit | null>(null);

const userCreate = useUserCreateForm({
  user,
  defaultUpnSuffix,
  defaultMailDomain,
});
const accountChangeEditor = useAccountChangeEditor();
const groupChangeEditor = useGroupChangeEditor();

const selectedApproverLabel = computed(() =>
  selectedApprover.value
    ? formatApproverSelectionLabel(selectedApprover.value)
    : null,
);

const approverSearch = useDirectoryTypeahead<AuthUserSearchHit>(
  approverQuery,
  async (requestQuery) => {
    const response = await useApi<AuthUserSearchResult>(
      `/auth/users/search?query=${encodeURIComponent(requestQuery)}&role=approver`,
    );

    return response.results;
  },
  {
    shouldSkip: (trimmedQuery) =>
      (!!selectedApproverLabel.value &&
        trimmedQuery === selectedApproverLabel.value) ||
      (!!selectedApprover.value &&
        trimmedQuery === selectedApprover.value.username),
    fallbackError: "Failed to search approvers.",
  },
);

watch(approverQuery, (query) => {
  if (
    selectedApprover.value &&
    query.trim() !== selectedApproverLabel.value &&
    query.trim() !== selectedApprover.value.username
  ) {
    selectedApprover.value = null;
    requestDetails.approverUsername = "";
  }
});

function handleApproverSelect(username: string) {
  const approver = approverSearch.results.find(
    (entry) => entry.username === username,
  );

  if (!approver) {
    return;
  }

  selectedApprover.value = approver;
  approverQuery.value = formatApproverSelectionLabel(approver);
  approverSearch.results = [];
  approverSearch.error = null;
  requestDetails.approverUsername = approver.username;
}

function buildPayload() {
  switch (requestDetails.kind) {
    case "user_create":
      return userCreate.buildPayload();
    case "group_change":
      return groupChangeEditor.buildPayload();
    case "account_change":
      return accountChangeEditor.buildPayload();
  }
}

async function submit() {
  submitting.value = true;

  try {
    if (!requestDetails.approverUsername) {
      throw new Error("Select an approver before submitting the request.");
    }

    const request = await useApi<ChangeRequestDetail>("/requests", {
      method: "POST",
      body: {
        title: requestDetails.title,
        justification: requestDetails.justification,
        approverUsername: requestDetails.approverUsername,
        payload: buildPayload(),
      },
    });

    await navigateTo(`/requests/${request.requestId}`);
  } catch (caught) {
    toast.add({
      description: toErrorMessage(caught, "Failed to create request."),
      color: "error",
      icon: "i-lucide-circle-alert",
    });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <UPage>
    <UPageHeader
      title="Create request"
      description="Submit a new user or select an existing AD account and stage property plus group membership changes in one request."
    />

    <UPageBody class="space-y-6">
      <UPageCard
        title="Request details"
        description="Describe the change and choose the approver who should decide it."
        variant="subtle"
      >
        <RequestMetadataFields
          :kind="requestDetails.kind"
          :title="requestDetails.title"
          :justification="requestDetails.justification"
          :approver-query="approverQuery"
          :approver-options="approverSearch.results"
          :approver-loading="approverSearch.loading"
          :approver-error="approverSearch.error"
          :selected-approver="selectedApprover"
          @update:kind="requestDetails.kind = $event"
          @update:title="requestDetails.title = $event"
          @update:justification="requestDetails.justification = $event"
          @update:approver-query="approverQuery = $event"
          @select:approver="handleApproverSelect"
        />
      </UPageCard>

      <UserCreateSection
        v-if="requestDetails.kind === 'user_create'"
        :controller="userCreate"
        :default-upn-suffix="defaultUpnSuffix"
        :default-mail-domain="defaultMailDomain"
      />

      <AccountChangeSection
        v-else-if="requestDetails.kind === 'account_change'"
        :editor="accountChangeEditor"
      />

      <GroupChangeSection
        v-else
        :editor="groupChangeEditor"
      />

      <div class="flex flex-wrap gap-3">
        <UButton icon="i-lucide-send" :loading="submitting" @click="submit">
          {{ submitting ? "Submitting…" : "Submit request" }}
        </UButton>
        <UButton color="neutral" variant="outline" to="/requests">
          Cancel
        </UButton>
      </div>
    </UPageBody>
  </UPage>
</template>
