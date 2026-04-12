<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    variant?: "subtle" | "soft" | "outline" | "solid";
    page: number;
    total: number;
    itemsPerPage: number;
    summary?: string;
    loading?: boolean;
    error?: string | null;
    loadingDescription?: string;
    empty?: boolean;
    emptyDescription?: string;
    emptyColor?: "neutral" | "warning";
    data: unknown[];
    columns: TableColumn<any>[];
    tableClass?: string;
  }>(),
  {
    description: undefined,
    variant: undefined,
    summary: undefined,
    loading: false,
    error: null,
    loadingDescription: "Loading…",
    empty: false,
    emptyDescription: "",
    emptyColor: "neutral",
    tableClass: "min-w-full",
  },
);

const emit = defineEmits<{
  "update:page": [value: number];
  select: [event: Event, row: any];
}>();

function handleSelect(event: Event, row: any) {
  emit("select", event, row);
}
</script>

<template>
  <PaginatedCard
    :title="props.title"
    :description="props.description"
    :variant="props.variant"
    :page="props.page"
    :total="props.total"
    :items-per-page="props.itemsPerPage"
    :summary="props.summary"
    @update:page="emit('update:page', $event)"
  >
    <AsyncState
      :loading="props.loading"
      :error="props.error"
      :empty="props.empty"
      :loading-description="props.loadingDescription"
      :empty-description="props.emptyDescription"
      :empty-color="props.emptyColor"
    >
      <div class="space-y-4">
        <slot name="toolbar" />
        <slot name="before-table" />

        <div class="min-w-0 max-w-full overflow-x-auto">
          <UTable
            :data="props.data"
            :columns="props.columns"
            :class="props.tableClass"
            @select="handleSelect"
          />
        </div>

        <slot name="after-table" />
      </div>
    </AsyncState>
  </PaginatedCard>
</template>
