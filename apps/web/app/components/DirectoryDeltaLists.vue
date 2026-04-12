<script setup lang="ts">
type DirectoryItemLike = {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
};

const props = withDefaults(
  defineProps<{
    currentTitle: string;
    currentDescription?: string;
    currentItems: DirectoryItemLike[];
    currentEmptyText: string;
    currentToneForItem?: (item: DirectoryItemLike) => "success" | "danger" | "neutral" | undefined;
    currentActionLabelForItem?: (item: DirectoryItemLike) => string | undefined;
    addTitle: string;
    addDescription?: string;
    addItems: DirectoryItemLike[];
    addEmptyText: string;
    addActionLabel?: string;
    removeTitle: string;
    removeDescription?: string;
    removeItems: DirectoryItemLike[];
    removeEmptyText: string;
    removeActionLabel?: string;
  }>(),
  {
    currentDescription: undefined,
    currentToneForItem: undefined,
    currentActionLabelForItem: undefined,
    addDescription: undefined,
    addActionLabel: undefined,
    removeDescription: undefined,
    removeActionLabel: undefined,
  },
);

const emit = defineEmits<{
  "current-action": [item: DirectoryItemLike];
  "add-action": [item: DirectoryItemLike];
  "remove-action": [item: DirectoryItemLike];
}>();
</script>

<template>
  <div class="space-y-4">
    <DirectoryGroupList
      :title="props.currentTitle"
      :description="props.currentDescription"
      :groups="props.currentItems"
      :empty-text="props.currentEmptyText"
      :tone-for-group="props.currentToneForItem"
      :action-label-for-group="props.currentActionLabelForItem"
      @action="emit('current-action', $event)"
    />

    <div class="grid gap-4 xl:grid-cols-2">
      <DirectoryGroupList
        :title="props.addTitle"
        :description="props.addDescription"
        :groups="props.addItems"
        :empty-text="props.addEmptyText"
        tone="success"
        :action-label="props.addActionLabel"
        @action="emit('add-action', $event)"
      />
      <DirectoryGroupList
        :title="props.removeTitle"
        :description="props.removeDescription"
        :groups="props.removeItems"
        :empty-text="props.removeEmptyText"
        tone="danger"
        :action-label="props.removeActionLabel"
        @action="emit('remove-action', $event)"
      />
    </div>
  </div>
</template>
