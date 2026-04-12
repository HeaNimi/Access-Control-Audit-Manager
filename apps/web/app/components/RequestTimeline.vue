<script setup lang="ts">
import type { RequestTimelineItem } from "@acam-ts/contracts";

import { formatDateTime, stateBadge } from "../utils/request-helpers";

const props = defineProps<{
  items: RequestTimelineItem[];
}>();

const attrs = useAttrs();

const emit = defineEmits<{
  select: [item: RequestTimelineItem];
}>();

const isInteractive = computed(() => typeof attrs.onSelect === "function");

const timelineItems = computed(() =>
  props.items.map((item) => ({
    ...item,
    date: formatDateTime(item.timestamp),
    description: item.message ?? undefined,
    value: item.id,
    icon:
      item.kind === "audit_log"
        ? "i-lucide-scroll-text"
        : item.kind === "observed_event"
          ? "i-lucide-radar"
          : item.kind === "execution"
            ? "i-lucide-play-circle"
            : item.kind === "approval"
              ? "i-lucide-badge-check"
              : "i-lucide-circle-dot",
  })),
);

function handleSelect(_event: Event, item: RequestTimelineItem) {
  if (!isInteractive.value) {
    return;
  }

  emit("select", item);
}
</script>

<template>
  <UTimeline
    :items="timelineItems"
    color="primary"
    class="min-w-0"
    @select="handleSelect"
  >
    <template #title="{ item }">
      <div
        class="flex min-w-0 flex-wrap items-start justify-between gap-2"
        :class="{ 'cursor-pointer': isInteractive }"
      >
        <span class="min-w-0 flex-1 break-words font-medium">{{ item.title }}</span>
        <UBadge
          v-if="item.status"
          v-bind="stateBadge(item.status)"
          class="shrink-0 capitalize"
        >
          {{ stateBadge(item.status).label }}
        </UBadge>
      </div>
    </template>

    <template #description="{ item }">
      <div class="min-w-0 space-y-1">
        <div v-if="item.description" class="break-words text-sm text-muted">
          {{ item.description }}
        </div>
        <div v-if="item.actor" class="break-words text-xs text-toned">
          Actor: {{ item.actor }}
        </div>
      </div>
    </template>
  </UTimeline>
</template>
