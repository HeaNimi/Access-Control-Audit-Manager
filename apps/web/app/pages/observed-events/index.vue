<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type {
  ObservedEventView,
  ObservedEventsListView,
} from "@acam-ts/contracts";

import { toErrorMessage } from "../../utils/errors";
import { formatDateTime, stateBadge } from "../../utils/request-helpers";

definePageMeta({
  middleware: ["auth", "access"],
  allowedRoles: ["approver", "auditor", "administrator"],
});

const UBadge = resolveComponent("UBadge");
const { showMessageToast } = useMessageToastController();
const { user } = useAuth();

const events = ref<ObservedEventsListView | null>(null);
const loading = ref(true);
const polling = ref(false);
const error = ref<string | null>(null);
const selectedEvent = ref<ObservedEventView | null>(null);
const currentPage = ref(1);
const pageSize = 50;

type SiemPollSourceResult = {
  sourceKey: string;
  status: "success" | "error" | "skipped";
  fetchedCount: number;
  storedCount: number;
  warningCount: number;
  error?: string | null;
};

type SiemPollSummary = {
  sourceResults: SiemPollSourceResult[];
};

const canPollSiem = computed(
  () => user.value?.roles.includes("administrator") ?? false,
);

function renderWrappedCell(
  value: string,
  options: {
    muted?: boolean;
    mono?: boolean;
  } = {},
) {
  return h(
    "div",
    {
      class: [
        "min-w-0 text-sm whitespace-normal [overflow-wrap:anywhere]",
        options.muted ? "text-muted" : "",
        options.mono ? "font-mono text-xs" : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    value,
  );
}

const columns: TableColumn<ObservedEventView>[] = [
  {
    accessorKey: "eventTime",
    header: "Time",
    meta: { class: { td: "whitespace-nowrap align-top" } },
    cell: ({ row }) => formatDateTime(row.original.eventTime),
  },
  {
    accessorKey: "sourceSystem",
    header: "Source",
    meta: { class: { td: "max-w-xs align-top whitespace-normal" } },
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h(
          "div",
          { class: "font-medium whitespace-normal [overflow-wrap:anywhere]" },
          row.original.sourceSystem,
        ),
        h(
          "div",
          { class: "text-sm text-muted whitespace-normal [overflow-wrap:anywhere]" },
          row.original.eventSource,
        ),
      ]),
  },
  {
    accessorKey: "eventType",
    header: "Event",
    meta: { class: { td: "max-w-sm align-top whitespace-normal" } },
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h(
          "div",
          { class: "font-medium whitespace-normal [overflow-wrap:anywhere]" },
          row.original.eventType || row.original.title || "Observed event",
        ),
        h(
          "div",
          { class: "text-sm text-muted whitespace-normal [overflow-wrap:anywhere]" },
          `Event ID: ${row.original.eventId ?? "n/a"}`,
        ),
      ]),
  },
  {
    accessorKey: "samAccountName",
    header: "Object",
    meta: { class: { td: "max-w-xs align-top whitespace-normal" } },
    cell: ({ row }) =>
      renderWrappedCell(
        row.original.samAccountName ||
          row.original.distinguishedName ||
          row.original.objectGuid ||
          "n/a",
      ),
  },
  {
    accessorKey: "subjectAccountName",
    header: "Subject",
    meta: { class: { td: "max-w-xs align-top whitespace-normal" } },
    cell: ({ row }) =>
      renderWrappedCell(row.original.subjectAccountName || "n/a"),
  },
  {
    accessorKey: "matchedRequest",
    header: "Matched request",
    meta: { class: { td: "max-w-sm align-top whitespace-normal" } },
    cell: ({ row }) => {
      const matchedRequest = row.original.matchedRequest;

      if (!matchedRequest) {
        return h("span", { class: "text-sm text-muted" }, "No request");
      }

      return h("div", { class: "space-y-1 py-1" }, [
        h(
          "button",
          {
            class:
              "text-left font-medium text-primary hover:underline focus:outline-none whitespace-normal [overflow-wrap:anywhere]",
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              void navigateTo(`/requests/${matchedRequest.requestId}`);
            },
          },
          `#${matchedRequest.requestNumber}`,
        ),
        h(
          "div",
          { class: "text-sm text-muted whitespace-normal [overflow-wrap:anywhere]" },
          matchedRequest.title,
        ),
      ]);
    },
  },
  {
    accessorKey: "correlationState",
    header: "State",
    meta: { class: { td: "whitespace-nowrap align-top" } },
    cell: ({ row }) =>
      h(
        UBadge,
        stateBadge(row.original.correlationState),
        () => stateBadge(row.original.correlationState).label,
      ),
  },
];

function handleRowSelect(_event: Event, row: TableRow<ObservedEventView>) {
  selectedEvent.value = row.original;
}

async function loadEvents(page = currentPage.value) {
  loading.value = true;
  error.value = null;

  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      scope: "all",
    });

    events.value = await useApi<ObservedEventsListView>(
      `/observed-events?${params.toString()}`,
    );
    currentPage.value = events.value.page;
  } catch (caught) {
    events.value = null;
    error.value = toErrorMessage(caught, "Failed to load observed events.");
  } finally {
    loading.value = false;
  }
}

function describePollResult(summary: SiemPollSummary) {
  const totals = summary.sourceResults.reduce(
    (accumulator, source) => ({
      fetched: accumulator.fetched + source.fetchedCount,
      stored: accumulator.stored + source.storedCount,
      warnings: accumulator.warnings + source.warningCount,
      errors: accumulator.errors + (source.status === "error" ? 1 : 0),
    }),
    { fetched: 0, stored: 0, warnings: 0, errors: 0 },
  );

  return `${totals.fetched} fetched, ${totals.stored} stored, ${totals.warnings} warning(s), ${totals.errors} error(s).`;
}

async function pollNow() {
  polling.value = true;

  try {
    const summary = await useApi<SiemPollSummary>("/siem/poll-now", {
      method: "POST",
    });

    const hasErrors = summary.sourceResults.some(
      (source) => source.status === "error",
    );

    showMessageToast(describePollResult(summary), {
      title: "SIEM poll finished",
      icon: hasErrors
        ? "i-lucide-triangle-alert"
        : "i-lucide-circle-check-big",
      color: hasErrors ? "warning" : "success",
    });

    await loadEvents();
  } catch (caught) {
    showMessageToast(toErrorMessage(caught, "Failed to poll SIEM events."), {
      title: "SIEM poll failed",
      color: "error",
      icon: "i-lucide-circle-alert",
    });
  } finally {
    polling.value = false;
  }
}

onMounted(loadEvents);
</script>

<template>
  <UPage>
    <UPageHeader
      title="Observed Events"
      description="Review observed AD and SIEM events, including matched request evidence, with the newest ingested rows shown first."
    >
      <template #links>
        <UButton
          v-if="canPollSiem"
          color="primary"
          variant="solid"
          icon="i-lucide-radio-receiver"
          :loading="polling"
          :disabled="loading"
          @click="pollNow"
        >
          Poll now
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          @click="loadEvents"
        >
          Refresh
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <PaginatedDataTableCard
        title="Observed events"
        description="Review matched and out-of-band AD or SIEM events in ingestion order so late or skewed source clocks do not hide fresh evidence."
        variant="subtle"
        :page="events?.page || currentPage"
        :total="events?.totalEntries || 0"
        :items-per-page="events?.pageSize || pageSize"
        :summary="
          events
            ? `${events.totalEntries} observed event${events.totalEntries === 1 ? '' : 's'} · Page ${events.page} of ${events.totalPages}`
            : ''
        "
        :loading="loading"
        :error="error"
        :empty="!loading && !error && (!events || events.totalEntries === 0)"
        loading-description="Loading observed events…"
        empty-description="No observed events are available right now."
        :data="events?.entries || []"
        :columns="columns"
        table-class="w-full table-fixed"
        @update:page="loadEvents"
        @select="handleRowSelect"
      />
    </UPageBody>

    <JsonDetailsDrawer
      :open="!!selectedEvent"
      title="Observed event"
      :subtitle="selectedEvent ? `${selectedEvent.eventType || selectedEvent.title || 'Observed event'} · ${formatDateTime(selectedEvent.eventTime)}` : undefined"
      :sections="
        selectedEvent
          ? [
              {
                label: 'Summary',
                value: {
                  observedEventId: selectedEvent.observedEventId,
                  eventSource: selectedEvent.eventSource,
                  sourceSystem: selectedEvent.sourceSystem,
                  sourceReference: selectedEvent.sourceReference,
                  eventId: selectedEvent.eventId,
                  eventType: selectedEvent.eventType,
                  title: selectedEvent.title,
                  message: selectedEvent.message,
                  objectGuid: selectedEvent.objectGuid,
                  distinguishedName: selectedEvent.distinguishedName,
                  samAccountName: selectedEvent.samAccountName,
                  subjectAccountName: selectedEvent.subjectAccountName,
                  correlationState: selectedEvent.correlationState,
                  matchedRequest: selectedEvent.matchedRequest,
                },
              },
              {
                label: 'Payload',
                value: selectedEvent.payload,
              },
            ]
          : []
      "
      @close="selectedEvent = null"
    />
  </UPage>
</template>
