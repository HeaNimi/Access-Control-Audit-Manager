<script setup lang="ts">
import type { SelectOption, TypeaheadOption } from "../types/ui";

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    variant?: "subtle" | "soft" | "outline" | "solid";
    label: string;
    query: string;
    options: TypeaheadOption[];
    loading?: boolean;
    selected?: boolean;
    placeholder?: string;
    emptyText?: string;
    searchError?: string | null;
    loadError?: string | null;
    successDescription?: string | null;
    clearable?: boolean;
    clearLabel?: string;
    objectType?: string;
    objectTypeLabel?: string;
    objectTypeItems?: SelectOption[];
  }>(),
  {
    description: undefined,
    variant: undefined,
    loading: false,
    selected: false,
    placeholder: "",
    emptyText: "No results found.",
    searchError: null,
    loadError: null,
    successDescription: null,
    clearable: false,
    clearLabel: "Clear",
    objectType: undefined,
    objectTypeLabel: "Object type",
    objectTypeItems: () => [],
  },
);

const emit = defineEmits<{
  "update:query": [value: string];
  "update:objectType": [value: string];
  select: [id: string];
  blur: [];
  clear: [];
}>();

useMessageToast(computed(() => props.loadError), {
  color: "error",
  icon: "i-lucide-circle-alert",
});

const hasTypeSelector = computed(() => props.objectTypeItems.length > 0);
</script>

<template>
  <UPageCard
    :title="props.title"
    :description="props.description"
    :variant="props.variant"
  >
    <div class="space-y-4">
      <div
        class="grid gap-4"
        :class="
          hasTypeSelector
            ? 'md:grid-cols-[200px_minmax(0,1fr)_auto]'
            : 'md:grid-cols-[minmax(0,1fr)_auto]'
        "
      >
        <UFormField
          v-if="hasTypeSelector"
          :label="props.objectTypeLabel"
          size="lg"
        >
          <USelect
            :model-value="props.objectType"
            :items="props.objectTypeItems"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="emit('update:objectType', $event)"
          />
        </UFormField>

        <DirectoryTypeahead
          :model-value="props.query"
          :label="props.label"
          :options="props.options"
          :loading="props.loading"
          :selected="props.selected"
          :error="props.searchError"
          :placeholder="props.placeholder"
          :empty-text="props.emptyText"
          @update:model-value="emit('update:query', $event)"
          @select="emit('select', $event)"
          @blur="emit('blur')"
        />

        <div v-if="props.clearable && props.selected" class="flex items-end">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-x"
            @click="emit('clear')"
          >
            {{ props.clearLabel }}
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="props.successDescription && !props.loadError"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check-big"
        :description="props.successDescription"
      />
    </div>
  </UPageCard>
</template>
