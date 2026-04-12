<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    variant?: "subtle" | "soft" | "outline" | "solid";
    page: number;
    total: number;
    itemsPerPage: number;
    summary?: string;
  }>(),
  {
    description: undefined,
    variant: undefined,
    summary: undefined,
  },
);

const emit = defineEmits<{
  "update:page": [value: number];
}>();

const showPagination = computed(() => props.total > props.itemsPerPage);

const defaultSummary = computed(() => {
  if (props.total <= 0) {
    return "";
  }

  const totalPages = Math.max(1, Math.ceil(props.total / props.itemsPerPage));
  return `${props.total} item${props.total === 1 ? "" : "s"} · Page ${props.page} of ${totalPages}`;
});
</script>

<template>
  <UPageCard
    :title="props.title"
    :description="props.description"
    :variant="props.variant"
  >
    <div class="space-y-4">
      <slot />

      <div
        v-if="showPagination"
        class="flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
      >
        <span>{{ props.summary || defaultSummary }}</span>
        <UPagination
          :page="props.page"
          :total="props.total"
          :items-per-page="props.itemsPerPage"
          @update:page="emit('update:page', $event)"
        />
      </div>
    </div>
  </UPageCard>
</template>
