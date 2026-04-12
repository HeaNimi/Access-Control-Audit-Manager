<script setup lang="ts">
import type { GroupChangeEditorController } from "../composables/useGroupChangeEditor";

const props = defineProps<{
  editor: GroupChangeEditorController;
}>();

const groupSnapshot = computed(() => props.editor.groupSnapshot.value);
const targetGroupQuery = computed({
  get: () => props.editor.targetGroupQuery.value,
  set: (value: string) => {
    props.editor.targetGroupQuery.value = value;
  },
});
const targetGroupOptions = computed(() => props.editor.targetGroupOptions.value);
const memberQuery = computed({
  get: () => props.editor.memberQuery.value,
  set: (value: string) => {
    props.editor.memberQuery.value = value;
  },
});
const memberOptions = computed(() => props.editor.memberOptions.value);
const currentGroupMembers = computed(
  () => props.editor.currentGroupMembers.value,
);
const membersToAdd = computed(() => props.editor.membersToAdd.value);
const membersToRemove = computed(() => props.editor.membersToRemove.value);

function toneForCurrentMember(member: {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
}) {
  return props.editor.isCurrentMemberMarkedForRemoval(member)
    ? "danger"
    : "neutral";
}

function currentMemberActionLabel(member: {
  distinguishedName?: string;
  samAccountName?: string;
  displayName?: string;
  objectGuid?: string;
}) {
  return props.editor.currentMemberActionLabel(member);
}
</script>

<template>
  <DirectoryObjectPickerCard
    title="Target group"
    description="Pick the target group from Active Directory, then stage direct user membership changes."
    variant="subtle"
    label="Target group"
    :query="targetGroupQuery"
    :options="targetGroupOptions"
    :selected="!!groupSnapshot"
    :loading="
      props.editor.groupTargetSearch.loading || props.editor.groupLoad.loading
    "
    placeholder="Search by group name or sAMAccountName"
    empty-text="No matching Active Directory groups."
    :search-error="props.editor.groupTargetSearch.error"
    :load-error="props.editor.groupLoad.error"
    :success-description="
      groupSnapshot
        ? `Loaded ${groupSnapshot.group.samAccountName} from Active Directory.`
        : null
    "
    @update:query="targetGroupQuery = $event"
    @select="props.editor.handleTargetGroupSelect"
    @blur="props.editor.handleTargetGroupBlur"
  />

  <template v-if="groupSnapshot">
    <UPageCard
      title="Group membership changes"
      description="Search direct user members, compare them with the current AD group state, and submit only the diffs."
      variant="subtle"
    >
      <div class="space-y-4">
        <DirectoryTypeahead
          v-model="memberQuery"
          label="Add direct users"
          :options="memberOptions"
          :loading="props.editor.memberSearch.loading"
          :error="props.editor.memberSearch.error"
          placeholder="Search users by display name, sAMAccountName, or UPN"
          empty-text="No matching Active Directory users."
          @select="props.editor.handleMemberSelect"
        />

        <DirectoryDeltaLists
          current-title="Current direct users"
          current-description="Direct user members currently present in the selected AD group."
          :current-items="currentGroupMembers"
          current-empty-text="No direct user members in the selected group."
          :current-tone-for-item="toneForCurrentMember"
          :current-action-label-for-item="currentMemberActionLabel"
          add-title="Members to add"
          add-description="Direct users that are absent from the current snapshot and will be added."
          :add-items="membersToAdd"
          add-empty-text="No member additions."
          add-action-label="Undo"
          remove-title="Members to remove"
          remove-description="Direct users that are currently present and will be removed."
          :remove-items="membersToRemove"
          remove-empty-text="No member removals."
          remove-action-label="Restore"
          @current-action="props.editor.toggleCurrentMember"
          @add-action="props.editor.removeDesiredMember"
          @remove-action="props.editor.restoreDesiredMember"
        />
      </div>
    </UPageCard>

    <CollapsibleSection
      title="Current group snapshot"
      description="The full AD group state is stored with the request and used for diffing and audit review."
    >
      <div class="space-y-4">
        <WrappedTextBlock
          :value="groupSnapshot.group.distinguishedName"
          mono
          padded
          muted
        />
        <div class="grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          <div class="min-w-0 space-y-1">
            <div class="text-xs font-medium uppercase tracking-wide text-muted">
              sAMAccountName
            </div>
            <WrappedTextBlock
              :value="groupSnapshot.group.samAccountName"
              mono
            />
          </div>
          <div class="min-w-0 space-y-1">
            <div class="text-xs font-medium uppercase tracking-wide text-muted">
              Display name
            </div>
            <WrappedTextBlock
              :value="groupSnapshot.group.displayName || 'Not set'"
            />
          </div>
          <div class="min-w-0 space-y-1">
            <div class="text-xs font-medium uppercase tracking-wide text-muted">
              Description
            </div>
            <WrappedTextBlock
              :value="groupSnapshot.group.description || 'No description.'"
            />
          </div>
        </div>

        <DirectoryGroupList
          title="Current direct members"
          description="Direct members captured in the stored group snapshot."
          :groups="groupSnapshot.group.members"
          empty-text="No direct members captured."
        />
      </div>
    </CollapsibleSection>
  </template>
</template>
