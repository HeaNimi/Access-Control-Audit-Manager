<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type { AuditLogView, ObservedEventView } from "@acam-ts/contracts";

import { formatDateTime, stateBadge } from "../utils/request-helpers";

defineProps<{
  observedEvents: ObservedEventView[];
  auditTrail: AuditLogView[];
}>();

const emit = defineEmits<{
  selectObserved: [event: ObservedEventView];
  selectAudit: [entry: AuditLogView];
}>();

const UBadge = resolveComponent("UBadge");

const observedColumns: TableColumn<ObservedEventView>[] = [
  {
    accessorKey: "eventTime",
    header: "Time",
    cell: ({ row }) => formatDateTime(row.original.eventTime),
  },
  {
    accessorKey: "sourceSystem",
    header: "Source",
    cell: ({ row }) => row.original.sourceSystem,
  },
  {
    accessorKey: "eventType",
    header: "Event",
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h(
          "div",
          { class: "font-medium text-highlighted" },
          row.original.eventType || row.original.title || "Observed event",
        ),
        h(
          "div",
          { class: "text-sm text-muted" },
          `Event ID: ${row.original.eventId ?? "n/a"}`,
        ),
      ]),
  },
  {
    accessorKey: "samAccountName",
    header: "Object",
    cell: ({ row }) =>
      row.original.samAccountName ||
      row.original.distinguishedName ||
      row.original.objectGuid,
  },
  {
    accessorKey: "correlationState",
    header: "State",
    cell: ({ row }) =>
      h(
        UBadge,
        stateBadge(row.original.correlationState),
        () => stateBadge(row.original.correlationState).label,
      ),
  },
];

const auditColumns: TableColumn<AuditLogView>[] = [
  {
    accessorKey: "createdAt",
    header: "Time",
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: "eventType",
    header: "Event",
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h("div", { class: "font-medium text-highlighted" }, row.original.eventType),
        h("div", { class: "text-sm text-muted" }, row.original.message),
      ]),
  },
  {
    accessorKey: "actorDisplayName",
    header: "Actor",
    cell: ({ row }) =>
      row.original.actorDisplayName ||
      row.original.actorUsername ||
      row.original.actorRole,
  },
];

function handleObservedSelect(_event: Event, row: TableRow<ObservedEventView>) {
  emit("selectObserved", row.original);
}

function handleAuditSelect(_event: Event, row: TableRow<AuditLogView>) {
  emit("selectAudit", row.original);
}
</script>

<template>
  <div class="space-y-6">
    <UPageCard
      title="Observed events"
      description="Correlated technical confirmation from AD or SIEM ingestion."
      variant="subtle"
    >
      <UAlert
        v-if="observedEvents.length === 0"
        color="neutral"
        variant="soft"
        icon="i-lucide-info"
        description="No correlated observed events yet."
      />
      <UTable
        v-else
        :data="observedEvents"
        :columns="observedColumns"
        @select="handleObservedSelect"
      />
    </UPageCard>

    <UPageCard
      title="Audit trail"
      description="Append-only internal ledger entries."
      variant="subtle"
    >
      <UTable
        :data="auditTrail"
        :columns="auditColumns"
        @select="handleAuditSelect"
      />
    </UPageCard>
  </div>
</template>
