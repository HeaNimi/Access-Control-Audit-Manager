<script setup lang="ts">
import type {
  AuditLogView,
  ChangeRequestDetail,
  ObservedEventView,
  RequestTimelineItem,
} from "@acam-ts/contracts";

import { toErrorMessage } from "../../utils/errors";
import { requestTypeLabel } from "../../utils/request-helpers";

interface ApiStatusError {
  statusCode?: number;
}

definePageMeta({
  middleware: "auth",
});

const route = useRoute();
const { user } = useAuth();

const detail = ref<ChangeRequestDetail | null>(null);
const timeline = ref<RequestTimelineItem[]>([]);
const loading = ref(true);
const actionLoading = ref(false);
const retryLoading = ref(false);
const error = ref<string | null>(null);
const selectedAuditEntry = ref<AuditLogView | null>(null);
const selectedObservedEvent = ref<ObservedEventView | null>(null);

const canApprove = computed(() => {
  if (!detail.value || !user.value) {
    return false;
  }

  const isAdministrator = user.value.roles.includes("administrator");
  const isAssignedApprover = detail.value.approvals.some(
    (approval) =>
      approval.approverUserId === user.value?.userId &&
      approval.decision === null,
  );

  return (
    detail.value.status === "submitted" &&
    (isAdministrator || isAssignedApprover)
  );
});

const canRetryExecution = computed(() => {
  if (!detail.value || !user.value) {
    return false;
  }

  return (
    user.value.roles.includes("administrator") &&
    detail.value.status === "failed" &&
    detail.value.execution?.executionStatus === "failed"
  );
});

async function loadRequest() {
  loading.value = true;
  error.value = null;
  detail.value = null;
  timeline.value = [];

  try {
    const requestId = route.params.id as string;
    detail.value = await useApi<ChangeRequestDetail>(`/requests/${requestId}`);
    timeline.value = await useApi<RequestTimelineItem[]>(
      `/requests/${requestId}/timeline`,
    );
  } catch (caught) {
    if ((caught as ApiStatusError | null)?.statusCode === 404) {
      return;
    }

    error.value = toErrorMessage(caught, "Failed to load request details.");
  } finally {
    loading.value = false;
  }
}

async function decide(decision: "approved" | "rejected") {
  actionLoading.value = true;
  error.value = null;

  try {
    const requestId = route.params.id as string;
    await useApi(`/requests/${requestId}/decision`, {
      method: "POST",
      body: {
        decision,
      },
    });

    await loadRequest();
  } catch (caught) {
    error.value = toErrorMessage(
      caught,
      "Failed to update approval decision.",
    );
  } finally {
    actionLoading.value = false;
  }
}

async function retryExecution() {
  retryLoading.value = true;
  error.value = null;

  try {
    const requestId = route.params.id as string;
    await useApi(`/requests/${requestId}/retry-execution`, {
      method: "POST",
    });

    await loadRequest();
  } catch (caught) {
    error.value = toErrorMessage(
      caught,
      "Failed to retry request execution.",
    );
  } finally {
    retryLoading.value = false;
  }
}

function handleObservedSelect(event: ObservedEventView) {
  selectedObservedEvent.value = event;
}

function handleAuditSelect(entry: AuditLogView) {
  selectedAuditEntry.value = entry;
}

onMounted(loadRequest);
</script>

<template>
  <UPage>
    <UPageHeader
      title="Request detail"
      :description="
        detail
          ? `#${detail.requestNumber} · ${requestTypeLabel(detail.requestType)}`
          : 'Loading request context…'
      "
    >
      <template #links>
        <UButton color="neutral" variant="outline" to="/requests">
          Back to list
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody class="space-y-6">
      <AsyncState
        :loading="loading"
        :error="error"
        :empty="!loading && !error && !detail"
        loading-description="Loading request detail…"
        empty-description="The request is unavailable or you do not have access to it."
        empty-color="warning"
      >
        <template v-if="detail">
          <RequestDetailSummaryGrid :detail="detail" />

          <RequestApprovalSection
            :approvals="detail.approvals"
            :can-approve="canApprove"
            :action-loading="actionLoading"
            @decide="decide"
          />

          <RequestExecutionSection
            :execution="detail.execution"
            :can-retry="canRetryExecution"
            :retry-loading="retryLoading"
            @retry="retryExecution"
          />

          <RequestContextSection :detail="detail" />

          <RequestDetailEventTables
            :observed-events="detail.observedEvents"
            :audit-trail="detail.auditTrail"
            @select-observed="handleObservedSelect"
            @select-audit="handleAuditSelect"
          />

          <UPageCard
            title="Timeline"
            description="Business and technical events rendered as one sequence."
            variant="subtle"
          >
            <RequestTimeline :items="timeline" />
          </UPageCard>
        </template>
      </AsyncState>
    </UPageBody>

    <RequestDetailDrawers
      :audit-entry="selectedAuditEntry"
      :observed-event="selectedObservedEvent"
      @close-audit="selectedAuditEntry = null"
      @close-observed="selectedObservedEvent = null"
    />
  </UPage>
</template>
