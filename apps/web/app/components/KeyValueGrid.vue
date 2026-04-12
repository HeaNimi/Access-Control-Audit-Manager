<script setup lang="ts">
import type { KeyValueItem } from "../types/ui";

const props = withDefaults(
  defineProps<{
    items: KeyValueItem[];
    gridClass?: string;
  }>(),
  {
    gridClass: "grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3",
  },
);
</script>

<template>
  <div :class="props.gridClass">
    <div
      v-for="item in props.items"
      :key="item.label"
      class="min-w-0 space-y-1"
      :class="item.colSpanClass"
    >
      <div class="text-xs font-medium uppercase tracking-wide text-muted">
        {{ item.label }}
      </div>
      <WrappedTextBlock :value="item.value" :mono="item.mono" />
    </div>
  </div>
</template>
