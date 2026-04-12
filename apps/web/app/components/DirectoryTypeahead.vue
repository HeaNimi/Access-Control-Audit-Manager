<script setup lang="ts">
import type { InputMenuItem } from "@nuxt/ui";
import type { TypeaheadOption } from "../types/ui";

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: string;
    options: TypeaheadOption[];
    error?: string | null;
    loading?: boolean;
    placeholder?: string;
    emptyText?: string;
    minChars?: number;
    disabled?: boolean;
    selected?: boolean;
  }>(),
  {
    error: null,
    loading: false,
    placeholder: "",
    emptyText: "No results found.",
    minChars: 2,
    disabled: false,
    selected: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  select: [id: string];
  blur: [];
}>();

useMessageToast(computed(() => props.error), {
  color: "warning",
  icon: "i-lucide-triangle-alert",
});

const selectedId = ref<string | undefined>(undefined);
const selectedOption = ref<TypeaheadOption | null>(null);
const isCommittingSelection = ref(false);

function toSearchText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toOptionArray(value: unknown): TypeaheadOption[] {
  return Array.isArray(value) ? value : [];
}

const searchTerm = computed(() => toSearchText(props.modelValue));

const optionList = computed(() => {
  const options = toOptionArray(props.options);

  if (
    selectedOption.value &&
    !options.some((option) => option.id === selectedOption.value?.id)
  ) {
    return [selectedOption.value, ...options];
  }

  return options;
});

const items = computed<InputMenuItem[]>(() =>
  optionList.value.map((option) => ({
    id: option.id,
    label: option.title,
    description: option.subtitle,
    meta: option.meta,
  })),
);

watch(
  () => props.selected,
  (selected) => {
    if (!selected) {
      selectedId.value = undefined;
      selectedOption.value = null;
    }
  },
);

watch(
  () => props.modelValue,
  (value) => {
    if (!value && !props.selected) {
      selectedId.value = undefined;
      selectedOption.value = null;
      return;
    }

    if (
      selectedOption.value &&
      value &&
      value !== selectedOption.value.title
    ) {
      selectedId.value = undefined;
      selectedOption.value = null;
    }
  },
);

function commitSelection(option: TypeaheadOption) {
  isCommittingSelection.value = true;
  selectedId.value = option.id;
  selectedOption.value = option;
  emit("update:modelValue", option.title);
  emit("select", option.id);
  nextTick(() => {
    isCommittingSelection.value = false;
  });
}

function clearSelection() {
  selectedId.value = undefined;
  selectedOption.value = null;
}

function findOptionForValue(
  value: string | number | Record<string, unknown>,
): TypeaheadOption | undefined {
  if (typeof value === "object") {
    const rawId = "id" in value ? value.id : "value" in value ? value.value : null;
    const rawLabel = "label" in value ? value.label : null;

    return optionList.value.find(
      (entry) =>
        (rawId !== null && entry.id === String(rawId)) ||
        (rawLabel !== null && entry.title === String(rawLabel)),
    );
  }

  const id = String(value);

  return optionList.value.find((entry) => entry.id === id);
}

function handleModelValueUpdate(
  value: string | number | Record<string, unknown> | null,
) {
  if (!value) {
    clearSelection();
    return;
  }

  const option = findOptionForValue(value);

  if (!option) {
    return;
  }

  commitSelection(option);
}

function handleSearchTermUpdate(value: unknown) {
  const nextSearchTerm = toSearchText(value);

  if (isCommittingSelection.value && nextSearchTerm === "") {
    return;
  }

  if (selectedOption.value) {
    if (
      nextSearchTerm === "" ||
      nextSearchTerm === selectedOption.value.title
    ) {
      return;
    }

    clearSelection();
  }

  emit("update:modelValue", nextSearchTerm);
}
</script>

<template>
  <UFormField
    :label="props.label"
    size="lg"
  >
    <template #label>
      <div class="flex items-center gap-2">
        <span>{{ props.label }}</span>
        <UTooltip
          v-if="props.error"
          :text="props.error"
          :content="{ side: 'top', sideOffset: 8 }"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="size-4 text-warning"
          />
        </UTooltip>
      </div>
    </template>

    <UInputMenu
      :model-value="selectedId"
      :search-term="searchTerm"
      value-key="id"
      label-key="label"
      description-key="description"
      :items="items"
      :loading="props.loading"
      :disabled="props.disabled"
      :placeholder="props.placeholder"
      :ignore-filter="true"
      :color="props.selected ? 'success' : props.error ? 'warning' : 'primary'"
      :highlight="props.selected"
      trailing
      icon="i-lucide-search"
      class="w-full"
      @blur="emit('blur')"
      @update:model-value="handleModelValueUpdate"
      @update:search-term="handleSearchTermUpdate"
    >
      <template #trailing>
        <UIcon
          :name="
            props.loading
              ? 'i-lucide-loader-circle'
              : props.selected
                ? 'i-lucide-circle-check-big'
                : 'i-lucide-search'
          "
          :class="props.loading ? 'animate-spin text-muted' : ''"
        />
      </template>

      <template #item="{ item }">
        <div class="flex min-w-0 items-start justify-between gap-3 py-1">
          <div class="min-w-0">
            <div class="truncate font-medium text-highlighted">
              {{ item.label }}
            </div>
            <div
              v-if="item.description"
              class="truncate text-sm text-muted"
            >
              {{ item.description }}
            </div>
          </div>
          <span
            v-if="item.meta"
            class="shrink-0 text-xs font-medium text-toned"
          >
            {{ item.meta }}
          </span>
        </div>
      </template>

      <template #empty>
        <div class="px-3 py-2 text-sm text-muted">
          {{ props.emptyText }}
        </div>
      </template>
    </UInputMenu>
  </UFormField>
</template>
