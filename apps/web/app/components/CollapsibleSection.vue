<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    open?: boolean;
  }>(),
  {
    description: undefined,
    open: false,
  },
);

const isOpen = ref(props.open);

watch(
  () => props.open,
  (value) => {
    isOpen.value = value;
  },
);
</script>

<template>
  <UCollapsible v-model:open="isOpen" class="rounded-2xl border border-default bg-default/60">
    <template #default="{ open }">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <div class="space-y-1">
          <div class="text-sm font-semibold text-highlighted">
            {{ props.title }}
          </div>
          <p v-if="props.description" class="text-sm text-muted">
            {{ props.description }}
          </p>
        </div>
        <UIcon
          :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="shrink-0 text-muted"
        />
      </button>
    </template>

    <template #content>
      <div class="border-t border-default px-4 py-4">
        <slot />
      </div>
    </template>
  </UCollapsible>
</template>
