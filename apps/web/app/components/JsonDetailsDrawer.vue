<script setup lang="ts">
import type { FocusOutsideEvent, PointerDownOutsideEvent } from "reka-ui";

const props = defineProps<{
  open: boolean;
  title: string;
  subtitle?: string;
  sections: JsonDetailsSection[];
}>();

const emit = defineEmits<{
  close: [];
}>();

type JsonDetailsSection = {
  label: string;
  value: unknown;
};

const drawerContentElement = ref<HTMLElement | null>(null);
const copiedSectionLabel = ref<string | null>(null);
let copiedResetTimeout: ReturnType<typeof setTimeout> | null = null;

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => {
    if (!value) {
      emit("close");
    }
  },
});

function isEventInsideDrawer(
  event: PointerDownOutsideEvent | FocusOutsideEvent,
) {
  const target = event.detail.originalEvent.target;

  return (
    target instanceof Node && !!drawerContentElement.value?.contains(target)
  );
}

function handlePointerDownOutside(event: PointerDownOutsideEvent) {
  if (isEventInsideDrawer(event)) {
    event.preventDefault();
  }
}

function handleInteractOutside(
  event: PointerDownOutsideEvent | FocusOutsideEvent,
) {
  if (isEventInsideDrawer(event)) {
    event.preventDefault();
  }
}

const drawerContentProps = {
  onPointerDownOutside: handlePointerDownOutside,
  onInteractOutside: handleInteractOutside,
};

function stringifyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

async function writeClipboardText(content: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function copySectionJson(section: JsonDetailsSection) {
  const content = stringifyJson(section.value);

  if (copiedResetTimeout) {
    clearTimeout(copiedResetTimeout);
    copiedResetTimeout = null;
  }

  try {
    await writeClipboardText(content);
    copiedSectionLabel.value = section.label;
    copiedResetTimeout = setTimeout(() => {
      copiedSectionLabel.value = null;
      copiedResetTimeout = null;
    }, 1800);
  } catch {
    copiedSectionLabel.value = null;
  }
}

onBeforeUnmount(() => {
  if (copiedResetTimeout) {
    clearTimeout(copiedResetTimeout);
  }
});
</script>

<template>
  <UDrawer
    v-model:open="openModel"
    direction="right"
    :handle="false"
    :dismissible="true"
    :content="drawerContentProps"
    :ui="{
      content: 'max-w-2xl',
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
        <div
          class="flex items-start justify-between gap-4 border-b border-default px-6 py-5"
        >
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
          <section
            v-for="section in props.sections"
            :key="section.label"
            class="space-y-2"
          >
            <div class="flex items-center justify-between gap-3">
              <h4 class="text-sm font-semibold text-highlighted">
                {{ section.label }}
              </h4>
              <UButton
                color="neutral"
                variant="outline"
                size="xs"
                class="shrink-0"
                :icon="
                  copiedSectionLabel === section.label
                    ? 'i-lucide-check'
                    : 'i-lucide-copy'
                "
                :aria-label="`Copy ${section.label} JSON`"
                :title="
                  copiedSectionLabel === section.label ? 'Copied' : 'Copy JSON'
                "
                @click="copySectionJson(section)"
              >
                {{
                  copiedSectionLabel === section.label ? "Copied" : "Copy JSON"
                }}
              </UButton>
            </div>

            <pre class="json-block">{{ stringifyJson(section.value) }}</pre>
          </section>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
