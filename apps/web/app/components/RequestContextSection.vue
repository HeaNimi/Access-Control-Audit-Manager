<script setup lang="ts">
import type {
  AccountChangePayload,
  ChangeRequestDetail,
  GroupChangePayload,
  UserCreatePayload,
} from "@acam-ts/contracts";

import { presentChangeValue, presentValue } from "../utils/display";
import {
  buildGroupSnapshotFields,
  buildUserCreateFields,
  getRequestedGroups,
  getRequestedMembers,
  redactRequestPayload,
} from "../utils/request-detail";

const props = defineProps<{
  detail: ChangeRequestDetail;
}>();

const accountChangePayload = computed<AccountChangePayload | null>(() => {
  if (props.detail.payload.kind !== "account_change") {
    return null;
  }

  return props.detail.payload;
});

const userCreatePayload = computed<UserCreatePayload | null>(() => {
  if (props.detail.payload.kind !== "user_create") {
    return null;
  }

  return props.detail.payload;
});

const groupChangePayload = computed<GroupChangePayload | null>(() => {
  if (props.detail.payload.kind !== "group_change") {
    return null;
  }

  return props.detail.payload;
});

const requestedGroupAdds = computed(() =>
  getRequestedGroups(accountChangePayload.value, "add"),
);

const requestedGroupRemovals = computed(() =>
  getRequestedGroups(accountChangePayload.value, "remove"),
);

const requestedInitialGroups = computed(
  () => userCreatePayload.value?.initialGroups ?? [],
);

const requestedMemberAdds = computed(() =>
  getRequestedMembers(groupChangePayload.value, "add"),
);

const requestedMemberRemovals = computed(() =>
  getRequestedMembers(groupChangePayload.value, "remove"),
);

const groupSnapshotFields = computed(() =>
  buildGroupSnapshotFields(groupChangePayload.value),
);

const userCreateFields = computed(() =>
  buildUserCreateFields(userCreatePayload.value),
);

const redactedPayload = computed(() => redactRequestPayload(props.detail.payload));
</script>

<template>
  <UPageCard
    title="Request context"
    description="Business justification and normalized payload."
    variant="subtle"
  >
    <div class="space-y-6">
      <div class="space-y-2">
        <div class="text-lg font-semibold text-highlighted">
          {{ detail.title }}
        </div>
        <p class="text-sm leading-6 text-muted">
          {{ detail.justification }}
        </p>
      </div>

      <template v-if="accountChangePayload">
        <UPageCard
          title="Requested delta"
          description="Only recorded differences from the loaded AD snapshot will be applied."
          variant="subtle"
        >
          <div class="space-y-4">
            <UAlert
              v-if="
                (accountChangePayload.changes?.length ?? 0) === 0 &&
                (accountChangePayload.groupChanges?.length ?? 0) === 0
              "
              color="neutral"
              variant="soft"
              icon="i-lucide-info"
              description="No requested differences were recorded."
            />

            <template v-else>
              <div class="grid gap-3">
                <div
                  v-for="change in accountChangePayload.changes ?? []"
                  :key="change.attribute"
                  class="rounded-2xl border border-success/30 bg-success/10 p-4"
                >
                  <div class="text-sm font-semibold text-highlighted">
                    {{ change.attribute }}
                  </div>
                  <div class="mt-1 text-sm text-muted">
                    {{
                      presentChangeValue(
                        change.attribute,
                        change.previousValue,
                      )
                    }}
                    →
                    {{ presentChangeValue(change.attribute, change.nextValue) }}
                  </div>
                </div>
              </div>

              <DirectoryGroupList
                title="Groups to add"
                :groups="requestedGroupAdds"
                empty-text="No group additions requested."
                tone="success"
              />
              <DirectoryGroupList
                title="Groups to remove"
                :groups="requestedGroupRemovals"
                empty-text="No group removals requested."
                tone="danger"
              />
            </template>
          </div>
        </UPageCard>

        <CollapsibleSection
          v-if="accountChangePayload.snapshot"
          title="Loaded AD snapshot"
          description="The stored AD state used for diffing and later audit review."
        >
          <AccountSnapshotSummary
            :account="accountChangePayload.snapshot.account"
            :loaded-at="accountChangePayload.snapshot.loadedAt"
            title="Current AD state"
          />
        </CollapsibleSection>
      </template>

      <template v-else-if="groupChangePayload">
        <UPageCard
          title="Requested delta"
          description="The selected group and direct user membership changes to apply."
          variant="subtle"
        >
          <div class="space-y-4">
            <div class="rounded-2xl border border-default bg-default/50 p-4">
              <div class="text-sm font-semibold text-highlighted">
                {{
                  presentValue(
                    groupChangePayload.target.displayName ||
                      groupChangePayload.target.samAccountName,
                  )
                }}
              </div>
              <div class="mt-1 font-mono text-xs text-muted">
                {{ groupChangePayload.target.distinguishedName }}
              </div>
            </div>

            <DirectoryGroupList
              title="Members to add"
              :groups="requestedMemberAdds"
              empty-text="No member additions requested."
              tone="success"
            />
            <DirectoryGroupList
              title="Members to remove"
              :groups="requestedMemberRemovals"
              empty-text="No member removals requested."
              tone="danger"
            />
          </div>
        </UPageCard>

        <CollapsibleSection
          v-if="groupChangePayload.snapshot"
          title="Loaded group snapshot"
          description="The stored AD group state used for diffing and later audit review."
        >
          <div class="space-y-4">
            <WrappedTextBlock
              :value="groupChangePayload.snapshot.group.distinguishedName"
              mono
              padded
              muted
            />
            <KeyValueGrid :items="groupSnapshotFields" />
            <DirectoryGroupList
              title="Current direct members"
              :groups="groupChangePayload.snapshot.group.members"
              empty-text="No direct members captured."
            />
          </div>
        </CollapsibleSection>
      </template>

      <template v-else-if="userCreatePayload">
        <UPageCard
          title="Requested user creation"
          description="The user object and initial group membership requested for creation."
          variant="subtle"
        >
          <KeyValueGrid :items="userCreateFields" />

          <div class="mt-4">
            <DirectoryGroupList
              title="Initial groups"
              description="These groups should be added after the user object is created."
              :groups="requestedInitialGroups"
              empty-text="No initial groups requested."
              tone="success"
            />
          </div>
        </UPageCard>
      </template>

      <CollapsibleSection
        title="Normalized payload"
        description="Raw stored request payload for debugging and audit review."
      >
        <pre class="json-block">{{ JSON.stringify(redactedPayload, null, 2) }}</pre>
      </CollapsibleSection>
    </div>
  </UPageCard>
</template>
