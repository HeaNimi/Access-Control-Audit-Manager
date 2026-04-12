<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type {
  ApplicationLogEntryView,
  ApplicationLogsView,
} from "@acam-ts/contracts";

import type { SelectOption } from "../../types/ui";
import { toErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/request-helpers";

definePageMeta({
  middleware: ["auth", "access"],
  allowedRoles: ["administrator"],
});

const logs = ref<ApplicationLogsView | null>(null);
const logsLoading = ref(true);
const logsError = ref<string | null>(null);
const selectedLogEntry = ref<ApplicationLogEntryView | null>(null);
const currentLogPage = ref(1);
const pageSize = 50;
const UBadge = resolveComponent("UBadge");
type LogLevelFilter = "all" | ApplicationLogEntryView["level"];

const levelFilter = ref<LogLevelFilter>("all");
const sourceFilter = ref("");
const logLevelItems: SelectOption<LogLevelFilter>[] = [
  { label: "All levels", value: "all" },
  { label: "Log", value: "log" },
  { label: "Warning", value: "warn" },
  { label: "Error", value: "error" },
  { label: "Debug", value: "debug" },
  { label: "Verbose", value: "verbose" },
];

function logLevelBadge(level: ApplicationLogEntryView["level"]) {
  switch (level) {
    case "error":
      return { color: "error" as const, variant: "subtle" as const };
    case "warn":
      return { color: "warning" as const, variant: "subtle" as const };
    case "debug":
    case "verbose":
      return { color: "neutral" as const, variant: "soft" as const };
    default:
      return { color: "info" as const, variant: "subtle" as const };
  }
}

const logColumns: TableColumn<ApplicationLogEntryView>[] = [
  {
    accessorKey: "timestamp",
    header: "Time",
    meta: { class: { td: "whitespace-nowrap" } },
    cell: ({ row }) => formatDateTime(row.original.timestamp),
  },
  {
    accessorKey: "level",
    header: "Level",
    cell: ({ row }) =>
      h(
        UBadge,
        logLevelBadge(row.original.level),
        () => row.original.level,
      ),
  },
  {
    accessorKey: "source",
    header: "Source",
    meta: { class: { td: "max-w-xs whitespace-normal" } },
    cell: ({ row }) =>
      h("span", { class: "font-mono text-xs [overflow-wrap:anywhere]" }, row.original.source),
  },
  {
    accessorKey: "message",
    header: "Message",
    meta: { class: { td: "max-w-3xl whitespace-normal" } },
    cell: ({ row }) =>
      h("div", { class: "text-sm [overflow-wrap:anywhere]" }, row.original.message),
  },
  {
    accessorKey: "meta",
    header: "Meta",
    cell: ({ row }) =>
      row.original.meta
        ? h(UBadge, { color: "neutral", variant: "soft" }, () => "JSON")
        : h("span", { class: "text-sm text-muted" }, "None"),
  },
];

async function loadLogs(page = currentLogPage.value) {
  logsLoading.value = true;
  logsError.value = null;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (levelFilter.value !== "all") {
    params.set("level", levelFilter.value);
  }

  if (sourceFilter.value.trim()) {
    params.set("source", sourceFilter.value.trim());
  }

  try {
    logs.value = await useApi<ApplicationLogsView>(
      `/settings/logs?${params.toString()}`,
    );
    currentLogPage.value = logs.value.page;
  } catch (caught) {
    logs.value = null;
    logsError.value = toErrorMessage(
      caught,
      "Failed to load application logs.",
    );
  } finally {
    logsLoading.value = false;
  }
}

function handleLogRowSelect(
  _event: Event,
  row: TableRow<ApplicationLogEntryView>,
) {
  selectedLogEntry.value = row.original;
}

function applyFilters() {
  void loadLogs(1);
}

function clearFilters() {
  levelFilter.value = "all";
  sourceFilter.value = "";
  void loadLogs(1);
}

onMounted(() => loadLogs());
</script>

<template>
  <UPage>
    <UPageHeader
      title="Logs"
      description="Browse paginated structured application logs from the API runtime."
    >
      <template #links>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          @click="loadLogs(currentLogPage)"
        >
          Refresh logs
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody class="space-y-6">
      <PaginatedDataTableCard
        title="Application logs"
        description="Newest structured log entries first."
        variant="subtle"
        :page="logs?.page || currentLogPage"
        :total="logs?.totalEntries || 0"
        :items-per-page="logs?.pageSize || pageSize"
        :summary="
          logs
            ? `${logs.totalEntries} log entr${logs.totalEntries === 1 ? 'y' : 'ies'} · Page ${logs.page} of ${logs.totalPages}`
            : ''
        "
        :loading="logsLoading"
        :error="logsError"
        :empty="!logsLoading && !logsError && (!logs || logs.totalEntries === 0)"
        loading-description="Loading application logs…"
        empty-description="No log entries are available right now."
        empty-color="warning"
        :data="logs?.entries || []"
        :columns="logColumns"
        @update:page="loadLogs"
        @select="handleLogRowSelect"
      >
        <template #toolbar>
          <div class="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto_auto]">
            <UFormField label="Level">
              <USelect
                v-model="levelFilter"
                :items="logLevelItems"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Source">
              <UInput
                v-model="sourceFilter"
                placeholder="Filter by source, for example http"
                class="w-full"
                @keyup.enter="applyFilters"
              />
            </UFormField>

            <UButton
              icon="i-lucide-filter"
              class="self-end"
              @click="applyFilters"
            >
              Apply
            </UButton>

            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-eraser"
              class="self-end"
              @click="clearFilters"
            >
              Clear
            </UButton>
          </div>
        </template>

        <template #before-table>
          <WrappedTextBlock v-if="logs" :value="logs.path" mono padded muted />
        </template>
      </PaginatedDataTableCard>
    </UPageBody>

    <JsonDetailsDrawer
      :open="!!selectedLogEntry"
      title="Log entry"
      :subtitle="
        selectedLogEntry
          ? `${selectedLogEntry.level.toUpperCase()} · ${formatDateTime(selectedLogEntry.timestamp)}`
          : undefined
      "
      :sections="
        selectedLogEntry
          ? [
              {
                label: 'JSON log entry',
                value: selectedLogEntry,
              },
            ]
          : []
      "
      @close="selectedLogEntry = null"
    />
  </UPage>
</template>
