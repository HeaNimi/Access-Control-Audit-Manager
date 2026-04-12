<script setup lang="ts">
import type { AuthUserSearchHit } from "@acam-ts/contracts";
import type { SelectOption, TypeaheadOption } from "../types/ui";
import { formatApproverSelectionLabel } from "../utils/directory";

const props = defineProps<{
  kind: "user_create" | "account_change" | "group_change";
  title: string;
  justification: string;
  approverQuery: string;
  approverOptions: AuthUserSearchHit[];
  approverLoading: boolean;
  approverError?: string | null;
  selectedApprover?: AuthUserSearchHit | null;
}>();

const emit = defineEmits<{
  "update:kind": [value: "user_create" | "account_change" | "group_change"];
  "update:title": [value: string];
  "update:justification": [value: string];
  "update:approverQuery": [value: string];
  "select:approver": [value: string];
}>();

const kindItems: SelectOption<"user_create" | "account_change" | "group_change">[] = [
  { label: "User creation", value: "user_create" },
  { label: "Account change", value: "account_change" },
  { label: "Group change", value: "group_change" },
];

const approverTypeaheadOptions = computed<TypeaheadOption[]>(() =>
  props.approverOptions.map((approver) => ({
    id: approver.username,
    title: formatApproverSelectionLabel(approver),
    subtitle: approver.email ?? undefined,
    meta: approver.username,
  })),
);

function handleApproverSelect(username: string) {
  emit("select:approver", username);
}
</script>

<template>
  <div class="grid gap-4 md:grid-cols-2">
    <UFormField label="Request type" size="lg">
    <USelect
        :model-value="props.kind"
        :items="kindItems"
        value-key="value"
        label-key="label"
        class="w-full"
        @update:model-value="emit('update:kind', $event)"
      />
    </UFormField>

    <DirectoryTypeahead
      :model-value="props.approverQuery"
      label="Approver"
      :options="approverTypeaheadOptions"
      :loading="props.approverLoading"
      :selected="!!props.selectedApprover"
      :error="props.approverError"
      placeholder="Search AD approvers by sAMAccountName or display name"
      empty-text="No matching approvers."
      @update:model-value="emit('update:approverQuery', $event)"
      @select="handleApproverSelect"
    />

    <UFormField label="Title" class="md:col-span-2" size="lg">
      <UInput
        :model-value="props.title"
        placeholder="Short business title"
        class="w-full"
        @update:model-value="emit('update:title', $event)"
      />
    </UFormField>

    <UFormField label="Justification" class="md:col-span-2" size="lg">
      <UTextarea
        :model-value="props.justification"
        placeholder="Why is this AD change required?"
        class="w-full"
        :rows="4"
        @update:model-value="emit('update:justification', $event)"
      />
    </UFormField>
  </div>
</template>
