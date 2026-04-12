<script setup lang="ts">
import type { DirectoryAccountView } from "@acam-ts/contracts";

import { presentEnabledState, presentExpiryValue, presentValue } from "../utils/display";

const props = withDefaults(
  defineProps<{
    account: DirectoryAccountView;
    loadedAt?: string;
    title?: string;
  }>(),
  {
    loadedAt: undefined,
    title: "Current AD snapshot",
  },
);

const fields = computed(() => [
  { label: "sAMAccountName", value: props.account.samAccountName, mono: true },
  { label: "Display name", value: presentValue(props.account.displayName) },
  { label: "Given name", value: presentValue(props.account.givenName) },
  { label: "Surname", value: presentValue(props.account.surname) },
  {
    label: "User principal name",
    value: presentValue(props.account.userPrincipalName),
  },
  { label: "Email", value: presentValue(props.account.mail) },
  { label: "Department", value: presentValue(props.account.department) },
  { label: "Title", value: presentValue(props.account.title) },
  { label: "Company", value: presentValue(props.account.company) },
  {
    label: "Telephone",
    value: presentValue(props.account.telephoneNumber),
  },
  { label: "Description", value: presentValue(props.account.description) },
  { label: "Enabled", value: presentEnabledState(props.account.enabled) },
  {
    label: "Account expiry",
    value: presentExpiryValue(props.account.accountExpiresAt),
  },
  { label: "Object GUID", value: presentValue(props.account.objectGuid), mono: true },
  { label: "Object SID", value: presentValue(props.account.objectSid), mono: true },
]);
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1">
      <div class="text-sm font-semibold">{{ props.title }}</div>
      <p v-if="props.loadedAt" class="text-sm text-muted">
        Captured {{ new Date(props.loadedAt).toLocaleString() }}
      </p>
    </div>

    <WrappedTextBlock :value="props.account.distinguishedName" padded muted />

    <KeyValueGrid :items="fields" />

    <DirectoryGroupList
      title="Current groups"
      description="Direct AD group memberships for the selected target account."
      :groups="props.account.groupMemberships"
      empty-text="No direct group memberships captured."
    />
  </div>
</template>
