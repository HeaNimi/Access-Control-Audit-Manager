<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type { ChangeRequestSummary } from "@acam-ts/contracts";

import {
  formatDateTime,
  requestTypeLabel,
  stateBadge,
} from "../../utils/request-helpers";
import { toErrorMessage } from "../../utils/errors";

definePageMeta({
  middleware: "auth",
});

const UBadge = resolveComponent("UBadge");

const requests = ref<ChangeRequestSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

const stats = computed(() => ({
  total: requests.value.length,
  submitted: requests.value.filter((request) => request.status === "submitted")
    .length,
  executed: requests.value.filter((request) => request.status === "executed")
    .length,
  missing: requests.value.filter(
    (request) => request.correlationState === "missing",
  ).length,
}));

const summaryItems = computed(() => [
  {
    title: "Total requests",
    description: "All recorded business requests.",
    value: stats.value.total,
  },
  {
    title: "Waiting approval",
    description: "Requests still awaiting a decision.",
    value: stats.value.submitted,
  },
  {
    title: "Executed",
    description: "Requests with finished execution.",
    value: stats.value.executed,
  },
  {
    title: "Missing event proof",
    description: "Executed requests still missing technical confirmation.",
    value: stats.value.missing,
  },
]);

const columns: TableColumn<ChangeRequestSummary>[] = [
  {
    accessorKey: "requestNumber",
    header: "Request",
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h("div", { class: "font-semibold" }, `#${row.original.requestNumber}`),
        h("div", { class: "text-sm text-muted" }, row.original.title),
      ]),
  },
  {
    accessorKey: "requestType",
    header: "Type",
    cell: ({ row }) => requestTypeLabel(row.original.requestType),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      h(
        UBadge,
        stateBadge(row.original.status),
        () => stateBadge(row.original.status).label,
      ),
  },
  {
    accessorKey: "correlationState",
    header: "Correlation",
    cell: ({ row }) =>
      h(
        UBadge,
        stateBadge(row.original.correlationState),
        () => stateBadge(row.original.correlationState).label,
      ),
  },
  {
    accessorKey: "requesterDisplayName",
    header: "Requester",
  },
  {
    accessorKey: "targetSummary",
    header: "Target",
    meta: {
      class: {
        td: "max-w-md text-sm text-muted",
      },
    },
  },
  {
    accessorKey: "submittedAt",
    header: "Submitted",
    cell: ({ row }) => formatDateTime(row.original.submittedAt),
  },
];

function openRequest(requestId: string) {
  navigateTo(`/requests/${requestId}`);
}

function handleRowSelect(_event: Event, row: TableRow<ChangeRequestSummary>) {
  void openRequest(row.original.requestId);
}

async function loadRequests() {
  loading.value = true;
  error.value = null;

  try {
    requests.value = await useApi<ChangeRequestSummary[]>("/requests");
  } catch (caught) {
    error.value = toErrorMessage(caught, "Failed to load requests.");
  } finally {
    loading.value = false;
  }
}

onMounted(loadRequests);
</script>

<template>
  <UPage>
    <UPageHeader
      title="Change Requests"
      description="Track submission, approval, execution, and correlation status in one queue."
    >
      <template #links>
        <div class="flex items-center gap-3">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            @click="loadRequests"
          >
            Refresh
          </UButton>
          <UButton icon="i-lucide-plus-circle" to="/requests/new">
            Create request
          </UButton>
        </div>
      </template>
    </UPageHeader>

    <UPageBody class="space-y-6">
      <SummaryCardGrid :items="summaryItems" variant="subtle" />

      <UPageCard
        title="Workflow queue"
        description="Every row links the business request to its technical and audit state."
        variant="subtle"
      >
        <AsyncState
          :loading="loading"
          :error="error"
          loading-description="Loading requests…"
        >
          <UTable
            :data="requests"
            :columns="columns"
            @select="handleRowSelect"
          />
        </AsyncState>
      </UPageCard>
    </UPageBody>
  </UPage>
</template>
