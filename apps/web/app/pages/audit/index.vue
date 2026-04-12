<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn, TableRow } from "@nuxt/ui";
import type {
  AuditLogView,
  AuditLogsView,
  AuditObjectView,
  ChangeRequestSummary,
  DirectoryGroupSearchResult,
  DirectoryGroupView,
  DirectoryUserSearchHit,
  DirectoryUserSearchResult,
  ObservedEventView,
  RequestTimelineItem,
} from "@acam-ts/contracts";

import { useDirectoryTypeahead } from "../../composables/useDirectoryTypeahead";
import { usePaginatedSlice } from "../../composables/usePaginatedSlice";
import type { SelectOption, TypeaheadOption } from "../../types/ui";
import {
  formatGroupSelectionLabel,
  formatUserSelectionLabel,
} from "../../utils/directory";
import { toErrorMessage } from "../../utils/errors";
import { formatDateTime, stateBadge } from "../../utils/request-helpers";

definePageMeta({
  middleware: ["auth", "access"],
  allowedRoles: ["approver", "auditor", "administrator"],
});

const UBadge = resolveComponent("UBadge");

const requestIdFilter = ref("");
const objectType = ref<"user" | "group">("user");
const objectQuery = ref("");
const selectedObjectSam = ref<string | null>(null);
const selectedGroupMemberId = ref<string | null>(null);
const entries = ref<AuditLogsView | null>(null);
const objectAudit = ref<AuditObjectView | null>(null);
const loading = ref(true);
const objectLoading = ref(false);
const error = ref<string | null>(null);
const objectError = ref<string | null>(null);
const selectedEntry = ref<AuditLogView | null>(null);
const selectedObservedEvent = ref<ObservedEventView | null>(null);
const ledgerPage = ref(1);
const relatedRequestsPage = ref(1);
const timelinePage = ref(1);
const ledgerPageSize = 50;
const relatedRequestsPageSize = 5;
const timelinePageSize = 8;
const objectTypeItems: SelectOption<"user" | "group">[] = [
  { label: "User", value: "user" },
  { label: "Group", value: "group" },
];
type GroupMemberRow = NonNullable<AuditObjectView["currentGroup"]>["members"][number];

const relatedRequestItems = computed(() => objectAudit.value?.relatedRequests ?? []);
const timelineItems = computed(() => objectAudit.value?.timeline ?? []);
const currentGroupMembers = computed<GroupMemberRow[]>(
  () => objectAudit.value?.currentGroup?.members ?? [],
);
const selectedObjectLabel = computed(() => {
  if (!objectAudit.value) {
    return null;
  }

  return objectType.value === "user"
    ? formatUserSelectionLabel({
        displayName:
          objectAudit.value.currentAccount?.displayName ??
          objectAudit.value.object.samAccountName,
        samAccountName: objectAudit.value.object.samAccountName,
      })
    : formatGroupSelectionLabel({
        displayName:
          objectAudit.value.currentGroup?.displayName ??
          objectAudit.value.object.samAccountName,
        samAccountName: objectAudit.value.object.samAccountName,
      });
});
const groupMemberFocusOptions = computed<SelectOption[]>(() => {
  const seen = new Set<string>();

  return currentGroupMembers.value.flatMap((member) => {
    const value = getGroupMemberFocusId(member);

    if (seen.has(value)) {
      return [];
    }

    seen.add(value);

    return [
      {
        label:
          formatUserSelectionLabel({
            displayName: member.displayName,
            samAccountName: member.samAccountName,
          }) ||
          member.displayName ||
          member.distinguishedName,
        value,
      },
    ];
  });
});

const objectSearch = useDirectoryTypeahead<
  DirectoryUserSearchHit | DirectoryGroupView
>(
  objectQuery,
  async (requestQuery) => {
    if (objectType.value === "user") {
      const response = await useApi<DirectoryUserSearchResult>(
        `/directory/users/search?query=${encodeURIComponent(requestQuery)}`,
      );
      return response.results;
    }

    const response = await useApi<DirectoryGroupSearchResult>(
      `/directory/groups/search?query=${encodeURIComponent(requestQuery)}`,
    );
    return response.results;
  },
  {
    shouldSkip: (trimmedQuery) =>
      !!selectedObjectLabel.value && trimmedQuery === selectedObjectLabel.value,
    fallbackError: "Failed to search Active Directory.",
  },
);

const { slice: paginatedRelatedRequests, pages: relatedRequestsPages } =
  usePaginatedSlice(relatedRequestItems, relatedRequestsPage, relatedRequestsPageSize);
const { slice: paginatedTimeline, pages: timelinePages } = usePaginatedSlice(
  timelineItems,
  timelinePage,
  timelinePageSize,
);

const objectOptions = computed<TypeaheadOption[]>(() => {
  if (objectType.value === "user") {
    return (objectSearch.results as DirectoryUserSearchHit[]).map((user) => ({
      id: user.samAccountName,
      title: formatUserSelectionLabel({
        displayName: user.displayName,
        samAccountName: user.samAccountName,
      }),
      subtitle: user.userPrincipalName || user.samAccountName,
      meta: user.samAccountName,
    }));
  }

  return (objectSearch.results as DirectoryGroupView[]).map((group) => ({
    id: group.samAccountName ?? group.distinguishedName,
    title: formatGroupSelectionLabel({
      displayName: group.displayName,
      samAccountName: group.samAccountName,
    }) || group.distinguishedName,
    subtitle: group.samAccountName,
    meta: group.distinguishedName,
  }));
});

const currentGroupFields = computed(() => {
  if (!objectAudit.value?.currentGroup) {
    return [];
  }

  return [
    {
      label: "sAMAccountName",
      value: objectAudit.value.currentGroup.samAccountName || "Not set",
      mono: true,
    },
    {
      label: "Display name",
      value: objectAudit.value.currentGroup.displayName || "Not set",
    },
    {
      label: "Description",
      value: objectAudit.value.currentGroup.description || "No description.",
    },
  ];
});

function getGroupMemberFocusId(member: GroupMemberRow): string {
  return member.samAccountName ?? member.distinguishedName;
}

function isFocusedGroupMember(member: GroupMemberRow): boolean {
  return (
    selectedGroupMemberId.value !== null &&
    getGroupMemberFocusId(member) === selectedGroupMemberId.value
  );
}

function renderGroupMemberCell(
  member: GroupMemberRow,
  value: string,
  options: {
    mono?: boolean;
    muted?: boolean;
    showFocusBadge?: boolean;
  } = {},
) {
  const textClass = [
    "[overflow-wrap:anywhere]",
    options.mono ? "font-mono text-xs" : "text-sm",
    options.muted ? "text-muted" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const children = [
    h("div", { class: textClass }, value),
  ];

  if (options.showFocusBadge && isFocusedGroupMember(member)) {
    children.unshift(
      h(
        UBadge,
        { color: "primary", variant: "soft", class: "mb-1" },
        () => "Focused",
      ),
    );
  }

  return h(
    "div",
    {
      class: [
        "rounded-md px-2 py-1.5 transition-colors",
        isFocusedGroupMember(member)
          ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
    children,
  );
}

const memberColumns: TableColumn<GroupMemberRow>[] = [
    {
      accessorKey: "displayName",
      header: "Name",
      cell: ({ row }) =>
        renderGroupMemberCell(row.original, row.original.displayName || "Not set", {
          showFocusBadge: true,
        }),
    },
    {
      accessorKey: "samAccountName",
      header: "sAMAccountName",
      cell: ({ row }) =>
        renderGroupMemberCell(row.original, row.original.samAccountName || "n/a", {
          mono: true,
        }),
    },
    {
      accessorKey: "memberType",
      header: "Type",
      cell: ({ row }) =>
        renderGroupMemberCell(row.original, row.original.memberType || "unknown"),
    },
    {
      accessorKey: "distinguishedName",
      header: "Distinguished name",
      meta: { class: { td: "max-w-lg" } },
      cell: ({ row }) =>
        renderGroupMemberCell(row.original, row.original.distinguishedName, {
          muted: true,
        }),
    },
  ];

const relatedRequestColumns: TableColumn<ChangeRequestSummary>[] = [
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
    accessorKey: "targetSummary",
    header: "Target",
    meta: { class: { td: "max-w-xl whitespace-normal text-sm text-muted [overflow-wrap:anywhere]" } },
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
];

const ledgerColumns: TableColumn<AuditLogView>[] = [
  {
    accessorKey: "createdAt",
    header: "Time",
    meta: { class: { td: "whitespace-nowrap" } },
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: "eventType",
    header: "Event",
    meta: { class: { td: "max-w-xl whitespace-normal" } },
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h(
          "div",
          { class: "font-medium [overflow-wrap:anywhere]" },
          row.original.eventType,
        ),
        h(
          "div",
          { class: "text-sm text-muted [overflow-wrap:anywhere]" },
          row.original.message,
        ),
      ]),
  },
  {
    accessorKey: "actorDisplayName",
    header: "Actor",
    meta: { class: { td: "max-w-xs whitespace-normal [overflow-wrap:anywhere]" } },
    cell: ({ row }) =>
      row.original.actorDisplayName ||
      row.original.actorUsername ||
      row.original.actorRole,
  },
  {
    accessorKey: "entityType",
    header: "Entity",
    meta: { class: { td: "max-w-md whitespace-normal" } },
    cell: ({ row }) =>
      h("div", { class: "space-y-1 py-1" }, [
        h("div", { class: "[overflow-wrap:anywhere]" }, row.original.entityType),
        h(
          "div",
          { class: "font-mono text-xs text-muted [overflow-wrap:anywhere]" },
          row.original.entityId,
        ),
      ]),
  },
];

watch(objectType, () => {
  objectQuery.value = "";
  selectedObjectSam.value = null;
  selectedGroupMemberId.value = null;
  objectAudit.value = null;
  objectError.value = null;
  objectSearch.reset();
  relatedRequestsPage.value = 1;
  timelinePage.value = 1;
});

watch(objectQuery, (query) => {
  if (objectAudit.value && query !== selectedObjectLabel.value) {
    selectedObjectSam.value = null;
    objectAudit.value = null;
  }
});

watch(objectAudit, () => {
  relatedRequestsPage.value = 1;
  timelinePage.value = 1;
  selectedGroupMemberId.value = null;
});

function findExactObjectMatch(query: string) {
  const trimmedQuery = query.trim().toLowerCase();

  if (!trimmedQuery) {
    return null;
  }

  if (objectType.value === "user") {
    const exactUser = (objectSearch.results as DirectoryUserSearchHit[]).find(
      (user) =>
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

    return exactUser?.samAccountName ?? null;
  }

  const exactGroup = (objectSearch.results as DirectoryGroupView[]).find(
    (group) =>
      [
        group.samAccountName,
        group.displayName,
        group.distinguishedName,
        formatGroupSelectionLabel({
          displayName: group.displayName,
          samAccountName: group.samAccountName,
        }),
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase() === trimmedQuery),
  );

  return exactGroup?.samAccountName ?? null;
}

async function loadAudit(page = ledgerPage.value) {
  loading.value = true;
  error.value = null;

  try {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(ledgerPageSize),
    });

    if (requestIdFilter.value.trim()) {
      params.set("requestId", requestIdFilter.value.trim());
    }

    entries.value = await useApi<AuditLogsView>(`/audit?${params.toString()}`);
    ledgerPage.value = entries.value.page;
  } catch (caught) {
    entries.value = null;
    error.value = toErrorMessage(caught, "Failed to load audit entries.");
  } finally {
    loading.value = false;
  }
}

async function loadObjectAudit(samAccountName: string) {
  objectLoading.value = true;
  objectError.value = null;

  try {
    const response = await useApi<AuditObjectView>(
      `/audit/object?type=${objectType.value}&samAccountName=${encodeURIComponent(samAccountName)}`,
    );
    objectSearch.error = null;
    objectSearch.results = [];
    objectAudit.value = response;
    selectedObjectSam.value = samAccountName;
    objectQuery.value = selectedObjectLabel.value ?? samAccountName;
  } catch (caught) {
    objectAudit.value = null;
    objectError.value = toErrorMessage(
      caught,
      "Failed to load the selected object.",
    );
  } finally {
    objectLoading.value = false;
  }
}

function handleObjectSelect(selectedId: string) {
  const samAccountName =
    objectType.value === "user"
      ? selectedId
      : ((objectSearch.results as DirectoryGroupView[]).find(
          (group) =>
            (group.samAccountName ?? group.distinguishedName) === selectedId,
        )?.samAccountName ?? null);

  if (!samAccountName) {
    objectError.value = "The selected object is missing sAMAccountName.";
    return;
  }

  void loadObjectAudit(samAccountName);
}

function handleObjectBlur() {
  if (objectAudit.value || objectSearch.loading || objectLoading.value) {
    return;
  }

  const exactMatch = findExactObjectMatch(objectQuery.value);

  if (exactMatch) {
    void loadObjectAudit(exactMatch);
  }
}

function clearObjectSelection() {
  objectQuery.value = "";
  selectedObjectSam.value = null;
  selectedGroupMemberId.value = null;
  objectAudit.value = null;
  objectError.value = null;
  objectSearch.reset();
  relatedRequestsPage.value = 1;
  timelinePage.value = 1;
}

function openAuditEntry(entry: AuditLogView) {
  selectedObservedEvent.value = null;
  selectedEntry.value = entry;
}

function openObservedEvent(event: ObservedEventView) {
  selectedEntry.value = null;
  selectedObservedEvent.value = event;
}

function handleTimelineSelect(item: RequestTimelineItem) {
  if (!objectAudit.value) {
    return;
  }

  if (item.kind === "audit_log") {
    const auditLogId = Number(item.id.replace("audit-", ""));
    const entry =
      objectAudit.value.auditTrail.find(
        (entry) => entry.auditLogId === auditLogId,
      ) ?? null;
    if (entry) {
      openAuditEntry(entry);
    }
    return;
  }

  if (item.kind === "observed_event") {
    const observedEventId = Number(item.id.replace("observed-", ""));
    const event =
      objectAudit.value.observedEvents.find(
        (entry) => entry.observedEventId === observedEventId,
      ) ?? null;
    if (event) {
      openObservedEvent(event);
    }
  }
}

function handleLedgerRowSelect(_event: Event, row: TableRow<AuditLogView>) {
  openAuditEntry(row.original);
}

function handleRequestRowSelect(
  _event: Event,
  row: TableRow<ChangeRequestSummary>,
) {
  void navigateTo(`/requests/${row.original.requestId}`);
}

onMounted(loadAudit);
</script>

<template>
  <UPage>
    <UPageHeader
      title="Audit Ledger"
      description="Inspect the append-only event history, current AD state, and timeline for a selected user or group."
    />

    <UPageBody class="space-y-6">
      <DirectoryObjectPickerCard
        title="Object audit"
        description="Choose a user or group to see current AD state and related request history."
        variant="subtle"
        :label="objectType === 'user' ? 'User search' : 'Group search'"
        :query="objectQuery"
        :options="objectOptions"
        :loading="objectSearch.loading || objectLoading"
        :selected="!!objectAudit"
        :placeholder="
          objectType === 'user'
            ? 'Search by display name, sAMAccountName, or UPN'
            : 'Search by group name or sAMAccountName'
        "
        :empty-text="
          objectType === 'user'
            ? 'No matching Active Directory users.'
            : 'No matching Active Directory groups.'
        "
        :search-error="objectSearch.error"
        :load-error="objectError"
        :clearable="!!objectAudit"
        :object-type="objectType"
        :object-type-items="objectTypeItems"
        @update:query="objectQuery = $event"
        @update:object-type="objectType = $event as 'user' | 'group'"
        @select="handleObjectSelect"
        @blur="handleObjectBlur"
        @clear="clearObjectSelection"
      />

      <template v-if="objectAudit">
        <AccountSnapshotSummary
          v-if="objectAudit.currentAccount"
          :account="objectAudit.currentAccount"
          title="Current user state"
        />

        <UPageCard
          v-else-if="objectAudit.currentGroup"
          :title="
            objectAudit.currentGroup.displayName ||
            objectAudit.currentGroup.samAccountName ||
            objectAudit.currentGroup.distinguishedName
          "
          description="Current group state and direct members."
          variant="subtle"
        >
          <div class="space-y-4">
            <WrappedTextBlock
              :value="objectAudit.currentGroup.distinguishedName"
              mono
              padded
              muted
            />
            <KeyValueGrid :items="currentGroupFields" />

            <div
              v-if="currentGroupMembers.length > 0"
              class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <UFormField
                label="Highlight member"
                description="Highlight one current member without filtering the group view."
              >
                <USelect
                  v-model="selectedGroupMemberId"
                  :items="groupMemberFocusOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Select a current member"
                  class="w-full"
                />
              </UFormField>

              <div v-if="selectedGroupMemberId" class="flex items-end">
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-eraser"
                  @click="selectedGroupMemberId = null"
                >
                  Clear highlight
                </UButton>
              </div>
            </div>

            <UTable
              :data="currentGroupMembers"
              :columns="memberColumns"
            />
          </div>
        </UPageCard>

        <div class="space-y-6">
          <PaginatedCard
            title="Related requests"
            description="Requests that targeted this object directly or changed its memberships."
            variant="subtle"
            :page="relatedRequestsPage"
            :total="relatedRequestItems.length"
            :items-per-page="relatedRequestsPageSize"
            :summary="`${
              relatedRequestItems.length
            } request${relatedRequestItems.length === 1 ? '' : 's'} · Page ${relatedRequestsPage} of ${relatedRequestsPages}`"
            @update:page="relatedRequestsPage = $event"
          >
            <AsyncState
              :empty="relatedRequestItems.length === 0"
              empty-description="No related requests found yet."
            >
              <UTable
                :data="paginatedRelatedRequests"
                :columns="relatedRequestColumns"
                @select="handleRequestRowSelect"
              />
            </AsyncState>
          </PaginatedCard>

          <PaginatedCard
            title="Object timeline"
            description="Business requests, approvals, execution, audit entries, and observed events for the selected object."
            variant="subtle"
            :page="timelinePage"
            :total="timelineItems.length"
            :items-per-page="timelinePageSize"
            :summary="`${
              timelineItems.length
            } event${timelineItems.length === 1 ? '' : 's'} · Page ${timelinePage} of ${timelinePages}`"
            @update:page="timelinePage = $event"
          >
            <AsyncState
              :empty="timelineItems.length === 0"
              empty-description="No timeline events found for this object yet."
            >
              <RequestTimeline
                :items="paginatedTimeline"
                @select="handleTimelineSelect"
              />
            </AsyncState>
          </PaginatedCard>
        </div>
      </template>

      <PaginatedDataTableCard
        v-if="!objectAudit"
        title="Raw audit ledger"
        description="Keep the append-only ledger visible for request-scoped inspection and JSON drill-down."
        variant="subtle"
        :page="entries?.page || ledgerPage"
        :total="entries?.totalEntries || 0"
        :items-per-page="entries?.pageSize || ledgerPageSize"
        :summary="
          entries
            ? `${entries.totalEntries} audit entr${entries.totalEntries === 1 ? 'y' : 'ies'} · Page ${entries.page} of ${entries.totalPages}`
            : ''
        "
        :loading="loading"
        :error="error"
        :empty="!loading && !error && (!entries || entries.totalEntries === 0)"
        loading-description="Loading audit entries…"
        empty-description="No audit entries match the current filter."
        :data="entries?.entries || []"
        :columns="ledgerColumns"
        @update:page="loadAudit"
        @select="handleLedgerRowSelect"
      >
        <template #toolbar>
          <div class="flex flex-wrap items-end gap-3">
            <UFormField
              label="Optional request ID filter"
              size="lg"
              class="min-w-0 flex-1 sm:min-w-[320px]"
            >
              <UInput v-model="requestIdFilter" placeholder="UUID" class="w-full" />
            </UFormField>

            <UButton icon="i-lucide-filter" @click="loadAudit(1)">
              Apply filter
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-eraser"
              @click="
                requestIdFilter = '';
                loadAudit(1);
              "
            >
              Clear
            </UButton>
          </div>
        </template>
      </PaginatedDataTableCard>
    </UPageBody>

    <JsonDetailsDrawer
      :open="!!selectedEntry"
      title="Audit ledger entry"
      :subtitle="
        selectedEntry
          ? `${selectedEntry.eventType} · ${formatDateTime(selectedEntry.createdAt)}`
          : undefined
      "
      :sections="
        selectedEntry
          ? [
              {
                label: 'Summary',
                value: {
                  auditLogId: selectedEntry.auditLogId,
                  eventType: selectedEntry.eventType,
                  actor:
                    selectedEntry.actorDisplayName ||
                    selectedEntry.actorUsername ||
                    selectedEntry.actorRole,
                  entityType: selectedEntry.entityType,
                  entityId: selectedEntry.entityId,
                  message: selectedEntry.message,
                  createdAt: selectedEntry.createdAt,
                },
              },
              {
                label: 'Event details',
                value: selectedEntry.eventDetails,
              },
            ]
          : []
      "
      @close="selectedEntry = null"
    />

    <JsonDetailsDrawer
      :open="!!selectedObservedEvent"
      title="Observed event"
      :subtitle="
        selectedObservedEvent
          ? `${selectedObservedEvent.eventType || selectedObservedEvent.title || 'Observed event'} · ${formatDateTime(selectedObservedEvent.eventTime)}`
          : undefined
      "
      :sections="
        selectedObservedEvent
          ? [
              {
                label: 'Summary',
                value: {
                  observedEventId: selectedObservedEvent.observedEventId,
                  sourceSystem: selectedObservedEvent.sourceSystem,
                  eventSource: selectedObservedEvent.eventSource,
                  sourceReference: selectedObservedEvent.sourceReference,
                  eventId: selectedObservedEvent.eventId,
                  eventType: selectedObservedEvent.eventType,
                  title: selectedObservedEvent.title,
                  message: selectedObservedEvent.message,
                  objectGuid: selectedObservedEvent.objectGuid,
                  distinguishedName: selectedObservedEvent.distinguishedName,
                  samAccountName: selectedObservedEvent.samAccountName,
                  subjectAccountName: selectedObservedEvent.subjectAccountName,
                  correlationState: selectedObservedEvent.correlationState,
                  matchedRequest: selectedObservedEvent.matchedRequest,
                },
              },
              {
                label: 'Payload',
                value: selectedObservedEvent.payload,
              },
            ]
          : []
      "
      @close="selectedObservedEvent = null"
    />
  </UPage>
</template>
