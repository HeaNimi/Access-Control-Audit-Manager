<script setup lang="ts">
import type { AccountChangeEditorController } from "../composables/useAccountChangeEditor";
import { accountAttributeFields } from "../utils/request-create";
import { presentChangeValue } from "../utils/display";

const props = defineProps<{
  editor: AccountChangeEditorController;
}>();

const accountSnapshot = computed(() => props.editor.accountSnapshot.value);
const targetUserQuery = computed({
  get: () => props.editor.targetUserQuery.value,
  set: (value: string) => {
    props.editor.targetUserQuery.value = value;
  },
});
const userOptions = computed(() => props.editor.userOptions.value);
const groupQuery = computed({
  get: () => props.editor.groupQuery.value,
  set: (value: string) => {
    props.editor.groupQuery.value = value;
  },
});
const groupOptions = computed(() => props.editor.groupOptions.value);
const currentGroups = computed(() => props.editor.currentGroups.value);
const groupsToAdd = computed(() => props.editor.groupsToAdd.value);
const groupsToRemove = computed(() => props.editor.groupsToRemove.value);
const attributeChangesPreview = computed(
  () => props.editor.attributeChangesPreview.value,
);

function toneForCurrentGroup(group: {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
}) {
  return props.editor.isCurrentGroupMarkedForRemoval(group) ? "danger" : "neutral";
}

function currentGroupActionLabel(group: {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
}) {
  return props.editor.currentGroupActionLabel(group);
}

function removeDesiredGroup(group: {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
}) {
  props.editor.removeDesiredGroup(group);
}

function restoreGroupRemoval(group: {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
}) {
  props.editor.restoreGroupRemoval(group);
}
</script>

<template>
  <DirectoryObjectPickerCard
    title="Target user"
    description="Type at least two characters and pick the target account from Active Directory search results."
    variant="subtle"
    label="Target user"
    :query="targetUserQuery"
    :options="userOptions"
    :selected="!!accountSnapshot"
    :loading="props.editor.userSearch.loading || props.editor.accountLoad.loading"
    placeholder="Search by display name, sAMAccountName, or UPN"
    empty-text="No matching Active Directory users."
    :search-error="props.editor.userSearch.error"
    :load-error="props.editor.accountLoad.error"
    :success-description="
      accountSnapshot
        ? `Loaded ${accountSnapshot.account.samAccountName} from Active Directory.`
        : null
    "
    @update:query="targetUserQuery = $event"
    @select="props.editor.handleTargetUserSelect"
    @blur="props.editor.handleTargetUserBlur"
  />

  <template v-if="accountSnapshot">
    <UPageCard
      title="Requested property updates"
      description="Edit the target account fields. Only the differences from the loaded snapshot will be submitted."
      variant="subtle"
    >
      <div class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UFormField
            v-for="field in accountAttributeFields"
            :key="field.key"
            :label="field.label"
            size="lg"
          >
            <UInput v-model="props.editor.form[field.key]" class="w-full" />
          </UFormField>
          <UFormField label="Account expiry" size="lg">
            <UInput
              v-model="props.editor.form.accountExpiresAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Enabled" size="lg" class="md:col-span-2 xl:col-span-3">
            <USwitch v-model="props.editor.form.enabled" />
          </UFormField>
          <UFormField
            label="Description"
            size="lg"
            class="md:col-span-2 xl:col-span-3"
          >
            <UTextarea
              v-model="props.editor.form.description"
              class="w-full"
              :rows="3"
            />
          </UFormField>
        </div>

        <div class="space-y-3">
          <div class="text-sm font-semibold text-highlighted">
            Planned attribute changes
          </div>
          <UAlert
            v-if="attributeChangesPreview.length === 0"
            color="neutral"
            variant="soft"
            icon="i-lucide-info"
            description="No attribute changes yet."
          />
          <div v-else class="grid gap-3">
            <div
              v-for="change in attributeChangesPreview"
              :key="change.attribute"
              class="rounded-2xl border border-success/30 bg-success/10 p-4"
            >
              <div class="text-sm font-semibold text-highlighted">
                {{ change.label }}
              </div>
              <div class="mt-1 text-sm text-muted">
                {{
                  presentChangeValue(change.attribute, change.previousValue)
                }}
                →
                {{ presentChangeValue(change.attribute, change.nextValue) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </UPageCard>

    <UPageCard
      title="Group memberships"
      description="Search groups like a picker, then compare desired membership to the current AD state."
      variant="subtle"
    >
      <div class="space-y-4">
        <DirectoryTypeahead
          v-model="groupQuery"
          label="Add groups"
          :options="groupOptions"
          :loading="props.editor.groupSearch.loading"
          :error="props.editor.groupSearch.error"
          placeholder="Search by group name or sAMAccountName"
          empty-text="No matching Active Directory groups."
          @select="props.editor.handleGroupSelect"
        />

        <DirectoryDeltaLists
          current-title="Current groups"
          current-description="Direct AD group memberships loaded from the current snapshot."
          :current-items="currentGroups"
          current-empty-text="No direct groups on the target account."
          :current-tone-for-item="toneForCurrentGroup"
          :current-action-label-for-item="currentGroupActionLabel"
          add-title="Groups to add"
          add-description="Groups that are absent from the current snapshot and will be added."
          :add-items="groupsToAdd"
          add-empty-text="No group additions."
          add-action-label="Undo"
          remove-title="Groups to remove"
          remove-description="Groups that are in the current snapshot but not in the desired membership."
          :remove-items="groupsToRemove"
          remove-empty-text="No group removals."
          remove-action-label="Restore"
          @current-action="props.editor.toggleCurrentGroup"
          @add-action="removeDesiredGroup"
          @remove-action="restoreGroupRemoval"
        />
      </div>
    </UPageCard>

    <CollapsibleSection
      title="Current AD state"
      description="The full snapshot is stored with the request and used for diffing plus later audit review."
    >
      <AccountSnapshotSummary
        :account="accountSnapshot.account"
        :loaded-at="accountSnapshot.loadedAt"
      />
    </CollapsibleSection>
  </template>
</template>
