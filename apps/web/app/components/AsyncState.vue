<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    loading?: boolean;
    error?: string | null;
    loadingDescription?: string;
    empty?: boolean;
    emptyDescription?: string;
    emptyColor?: "neutral" | "warning";
  }>(),
  {
    loading: false,
    error: null,
    loadingDescription: "Loading…",
    empty: false,
    emptyDescription: "",
    emptyColor: "neutral",
  },
);
</script>

<template>
  <UAlert
    v-if="props.error"
    color="error"
    variant="soft"
    icon="i-lucide-circle-alert"
    :description="props.error"
  />

  <UAlert
    v-else-if="props.loading"
    color="neutral"
    variant="soft"
    icon="i-lucide-loader-circle"
    :description="props.loadingDescription"
  />

  <UAlert
    v-else-if="props.empty && props.emptyDescription"
    :color="props.emptyColor"
    variant="soft"
    icon="i-lucide-info"
    :description="props.emptyDescription"
  />

  <slot v-else />
</template>
