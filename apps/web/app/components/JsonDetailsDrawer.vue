<script setup lang="ts">
import type { FocusOutsideEvent, PointerDownOutsideEvent } from "reka-ui";

const props = defineProps<{
  open: boolean;
  title: string;
  subtitle?: string;
  sections: Array<{
    label: string;
    value: unknown;
  }>;
}>();

const emit = defineEmits<{
  close: [];
}>();

const drawerContentElement = ref<HTMLElement | null>(null);

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value) {
      emit("close");
    }
  },
});

function isEventInsideDrawer(event: PointerDownOutsideEvent | FocusOutsideEvent) {
  const target = event.detail.originalEvent.target;

  return target instanceof Node && !!drawerContentElement.value?.contains(target);
}

function handlePointerDownOutside(event: PointerDownOutsideEvent) {
  if (isEventInsideDrawer(event)) {
    event.preventDefault();
  }
}

function handleInteractOutside(event: PointerDownOutsideEvent | FocusOutsideEvent) {
  if (isEventInsideDrawer(event)) {
    event.preventDefault();
  }
}

const drawerContentProps = {
  onPointerDownOutside: handlePointerDownOutside,
  onInteractOutside: handleInteractOutside,
};
</script>

<template>
  <UDrawer
    v-model:open="openModel"
    direction="right"
    :handle="false"
    :dismissible="true"
    :content="drawerContentProps"
    :ui="{
      content: 'max-w-2xl'
    }"
  >
    <template #content>
      <div
        ref="drawerContentElement"
        class="flex h-full w-full flex-col bg-default"
        @click.stop
        @mousedown.stop
        @pointerdown.stop
        @touchstart.stop
      >
        <div class="flex items-start justify-between gap-4 border-b border-default px-6 py-5">
          <div class="space-y-1">
            <h3 class="text-lg font-semibold text-highlighted">
              {{ props.title }}
            </h3>
            <p v-if="props.subtitle" class="text-sm text-muted">
              {{ props.subtitle }}
            </p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            @click="emit('close')"
          />
        </div>

        <div class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <UPageCard
            v-for="section in props.sections"
            :key="section.label"
            :title="section.label"
            variant="subtle"
          >
            <pre class="json-block">{{
              JSON.stringify(section.value, null, 2)
            }}</pre>
          </UPageCard>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
