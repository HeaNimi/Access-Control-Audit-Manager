<script setup lang="ts">
interface SummaryCardItem {
  title: string;
  description?: string;
  value: string | number;
  mono?: boolean;
  valueClass?: string;
}

const props = withDefaults(
  defineProps<{
    items: SummaryCardItem[];
    gridClass?: string;
    variant?: "subtle" | "soft" | "outline" | "solid";
    defaultValueClass?: string;
  }>(),
  {
    gridClass: "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
    variant: undefined,
    defaultValueClass: "text-3xl font-semibold",
  },
);
</script>

<template>
  <div :class="props.gridClass">
    <UPageCard
      v-for="item in props.items"
      :key="item.title"
      :title="item.title"
      :description="item.description"
      :variant="props.variant"
    >
      <div
        class="min-w-0 whitespace-normal break-words"
        :class="[
          item.valueClass || props.defaultValueClass,
          item.mono ? 'font-mono break-all' : undefined,
        ]"
      >
        {{ item.value }}
      </div>
    </UPageCard>
  </div>
</template>
