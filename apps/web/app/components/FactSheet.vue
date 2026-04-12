<script setup lang="ts">
import type { KeyValueItem } from "../types/ui";

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    items: KeyValueItem[];
    variant?: "subtle" | "soft" | "outline" | "solid";
    gridClass?: string;
  }>(),
  {
    title: undefined,
    description: undefined,
    variant: "subtle",
    gridClass: "grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-5",
  },
);
</script>

<template>
  <UPageCard
    :title="props.title"
    :description="props.description"
    :variant="props.variant"
  >
    <KeyValueGrid :items="props.items" :grid-class="props.gridClass" />
  </UPageCard>
</template>
