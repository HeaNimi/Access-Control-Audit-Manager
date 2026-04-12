<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";

type DirectoryGroupLike = {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
};

type Tone = "success" | "danger" | "neutral";

interface RowModel {
  key: string;
  item: DirectoryGroupLike;
  tone: Tone;
  actionLabel?: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    groups: DirectoryGroupLike[];
    emptyText: string;
    actionLabel?: string;
    tone?: Tone;
    toneForGroup?: (group: DirectoryGroupLike) => Tone | undefined;
    actionLabelForGroup?: (group: DirectoryGroupLike) => string | undefined;
  }>(),
  {
    description: undefined,
    actionLabel: undefined,
    tone: "neutral",
    toneForGroup: undefined,
    actionLabelForGroup: undefined,
  },
);

const emit = defineEmits<{
  action: [group: DirectoryGroupLike];
}>();

const UBadge = resolveComponent("UBadge");
const UButton = resolveComponent("UButton");

function toneBadgeLabel(tone: Tone) {
  if (tone === "success") {
    return "Added";
  }

  if (tone === "danger") {
    return "Removed";
  }

  return "Current";
}

const rows = computed<RowModel[]>(() =>
  props.groups.map((group, index) => ({
    key:
      group.objectGuid ??
      group.distinguishedName ??
      group.samAccountName ??
      `${group.displayName ?? "group"}-${index}`,
    item: group,
    tone: props.toneForGroup?.(group) ?? props.tone,
    actionLabel: props.actionLabelForGroup?.(group) ?? props.actionLabel,
  })),
);

const columns = computed<TableColumn<RowModel>[]>(() => [
  {
    accessorKey: "item",
    header: props.title,
    meta: {
      class: {
        th: "w-[70%]",
        td: "align-top",
      },
    },
    cell: ({ row }) => {
      const current = row.original;
      const group = current.item;
      const toneColor =
        current.tone === "success"
          ? "success"
          : current.tone === "danger"
            ? "error"
            : "neutral";
      const titleClass =
        current.tone === "success"
          ? "truncate font-medium text-success"
          : current.tone === "danger"
            ? "truncate font-medium text-error"
            : "truncate font-medium";

      return h("div", { class: "flex min-w-0 flex-col gap-2 py-1" }, [
        h("div", { class: "flex min-w-0 items-center gap-2" }, [
          h(
            "span",
            { class: titleClass },
            group.displayName || group.samAccountName || group.distinguishedName || "Group",
          ),
          h(
            UBadge,
            { color: toneColor, variant: "soft", size: "sm" },
            () => toneBadgeLabel(current.tone),
          ),
        ]),
        group.samAccountName
          ? h("div", { class: "text-xs font-medium text-toned" }, group.samAccountName)
          : null,
        group.distinguishedName
          ? h(
              "div",
              {
                class:
                  "min-w-0 overflow-hidden text-sm text-muted [overflow-wrap:anywhere]",
              },
              group.distinguishedName,
            )
          : null,
      ]);
    },
  },
  {
    id: "action",
    header: "",
    meta: {
      class: {
        th: "w-px",
        td: "text-right align-top",
      },
    },
    cell: ({ row }) => {
      if (!row.original.actionLabel) {
        return null;
      }

      return h(
        UButton,
        {
          color:
            row.original.tone === "danger"
              ? "error"
              : row.original.tone === "success"
                ? "success"
                : "neutral",
          variant: row.original.tone === "neutral" ? "ghost" : "soft",
          size: "sm",
          onClick: () => emit("action", row.original.item),
        },
        () => row.original.actionLabel,
      );
    },
  },
]);
</script>

<template>
  <div class="space-y-3">
    <div>
      <h4 class="text-sm font-semibold">{{ props.title }}</h4>
      <p v-if="props.description" class="mt-1 text-sm text-muted">
        {{ props.description }}
      </p>
    </div>

    <UAlert
      v-if="props.groups.length === 0"
      color="neutral"
      variant="soft"
      icon="i-lucide-info"
      :description="props.emptyText"
    />

    <UTable
      v-else
      :data="rows"
      :columns="columns"
      :ui="{
        td: 'px-4 py-3',
        th: 'px-4 py-3 text-xs uppercase tracking-wide text-muted'
      }"
    />
  </div>
</template>
