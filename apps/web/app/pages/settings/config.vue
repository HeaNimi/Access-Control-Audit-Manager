<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";
import type { SettingsRuntimeView } from "@acam-ts/contracts";

import { toErrorMessage } from "../../utils/errors";
import { stateBadge } from "../../utils/request-helpers";

definePageMeta({
  middleware: ["auth", "access"],
  allowedRoles: ["administrator"],
});

const runtime = ref<SettingsRuntimeView | null>(null);
const runtimeLoading = ref(true);
const runtimeError = ref<string | null>(null);

const runtimeFacts = computed(() => {
  if (!runtime.value) {
    return [];
  }

  return [
    {
      label: "Environment",
      value: runtime.value.environment,
    },
    {
      label: "Version",
      value: runtime.value.appVersion,
    },
    {
      label: "Started",
      value: new Date(runtime.value.startedAt).toLocaleString(),
    },
    {
      label: "Uptime",
      value: `${runtime.value.uptimeSeconds} seconds`,
    },
  ];
});

const healthIssues = computed(
  () =>
    runtime.value?.health.filter((check) => check.status !== "healthy") ?? [],
);

const runtimeColumns: TableColumn<SettingsRuntimeView["health"][number]>[] = [
  {
    accessorKey: "label",
    header: "Check",
    meta: { class: { td: "max-w-4xl whitespace-normal" } },
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h("div", { class: "font-medium [overflow-wrap:anywhere]" }, row.original.label),
        h("div", { class: "text-sm text-muted [overflow-wrap:anywhere]" }, row.original.detail),
      ]),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) =>
      h(
        resolveComponent("UBadge"),
        stateBadge(row.original.status),
        () => stateBadge(row.original.status).label,
      ),
  },
];

const configColumns: TableColumn<{
  key: string;
  value: string;
  redacted?: boolean;
}>[] = [
  {
    accessorKey: "key",
    header: "Key",
    cell: ({ row }) =>
      h("span", { class: "font-mono text-xs" }, row.original.key),
  },
  {
    accessorKey: "value",
    header: "Value",
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h("div", { class: "font-mono text-xs" }, row.original.value),
        row.original.redacted
          ? h("div", { class: "text-xs text-muted" }, "redacted")
          : null,
      ]),
  },
];

async function loadRuntime() {
  runtimeLoading.value = true;
  runtimeError.value = null;

  try {
    runtime.value = await useApi<SettingsRuntimeView>("/settings/runtime");
  } catch (caught) {
    runtime.value = null;
    runtimeError.value = toErrorMessage(
      caught,
      "Failed to load runtime settings.",
    );
  } finally {
    runtimeLoading.value = false;
  }
}

onMounted(loadRuntime);
</script>

<template>
  <UPage>
    <UPageHeader
      title="Current config"
      description="Review runtime health and effective configuration."
    >
      <template #links>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-rotate-cw"
          @click="loadRuntime"
        >
          Refresh
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody class="space-y-6">
      <AsyncState
        :loading="runtimeLoading"
        :error="runtimeError"
        :empty="!runtimeLoading && !runtimeError && !runtime"
        loading-description="Loading runtime settings…"
        empty-description="Runtime details are unavailable right now."
        empty-color="warning"
      >
        <div v-if="runtime" class="space-y-6">
          <FactSheet
            :items="runtimeFacts"
            grid-class="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-4"
          />

          <UPageCard
            v-if="healthIssues.length"
            title="Health issues"
            description="Warnings and errors reported by runtime checks."
            variant="subtle"
          >
            <div class="space-y-3">
              <UAlert
                v-for="check in healthIssues"
                :key="check.key"
                :color="check.status === 'error' ? 'error' : 'warning'"
                variant="soft"
                :icon="
                  check.status === 'error'
                    ? 'i-lucide-circle-alert'
                    : 'i-lucide-triangle-alert'
                "
                :title="check.label"
                :description="check.detail"
              />
            </div>
          </UPageCard>

          <UPageCard
            title="Health"
            description="Current dependency and integration checks."
            variant="subtle"
          >
            <UTable :data="runtime.health" :columns="runtimeColumns" />
          </UPageCard>

          <div class="space-y-4">
            <div class="space-y-1">
              <div class="text-sm font-semibold">Effective configuration</div>
              <p class="text-sm text-muted">
                Runtime configuration as seen by the API, with sensitive values
                redacted.
              </p>
            </div>
            <UPageCard
              v-for="section in runtime.configSections"
              :key="section.key"
              :title="section.label"
              variant="subtle"
            >
              <UTable :data="section.entries" :columns="configColumns" />
            </UPageCard>
          </div>
        </div>
      </AsyncState>
    </UPageBody>
  </UPage>
</template>
