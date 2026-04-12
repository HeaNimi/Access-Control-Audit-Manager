<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value?: string | null;
    mono?: boolean;
    padded?: boolean;
    muted?: boolean;
  }>(),
  {
    value: "",
    mono: false,
    padded: false,
    muted: false,
  },
);

const classes = computed(() => [
  "min-w-0 [overflow-wrap:anywhere] break-words",
  props.mono ? "font-mono text-xs" : "text-sm",
  props.muted ? "text-muted" : "",
  props.padded ? "rounded-xl border border-default bg-elevated/30 px-3 py-2" : "",
]);
</script>

<template>
  <div :class="classes">
    {{ props.value || "Not set" }}
  </div>
</template>
