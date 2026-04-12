<script setup lang="ts">
import type { UserCreateFormController } from "../composables/useUserCreateForm";

const props = defineProps<{
  controller: UserCreateFormController;
  defaultUpnSuffix: string;
  defaultMailDomain: string;
}>();

const groupQuery = computed({
  get: () => props.controller.groupQuery.value,
  set: (value: string) => {
    props.controller.groupQuery.value = value;
  },
});

const groupOptions = computed(() => props.controller.groupOptions.value);
</script>

<template>
  <UPageCard
    title="New user details"
    description="sAMAccountName follows givenname.surname until you override it, while display name, UPN, and mail follow the current name."
    variant="subtle"
  >
    <div class="space-y-6">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Given name" size="lg">
          <UInput v-model="props.controller.form.givenName" class="w-full" />
        </UFormField>
        <UFormField label="Surname" size="lg">
          <UInput v-model="props.controller.form.surname" class="w-full" />
        </UFormField>
        <UFormField label="sAMAccountName" size="lg">
          <UInput
            v-model="props.controller.form.samAccountName"
            class="w-full"
            @input="props.controller.markDefaultAsManual('samAccountName')"
          />
        </UFormField>
        <UFormField label="Display name" size="lg">
          <UInput
            v-model="props.controller.form.displayName"
            class="w-full"
            @input="props.controller.markDefaultAsManual('displayName')"
          />
        </UFormField>
        <UFormField label="User principal name" size="lg">
          <UInput
            v-model="props.controller.form.userPrincipalName"
            class="w-full"
            :placeholder="`john.doe@${props.defaultUpnSuffix}`"
            @input="props.controller.markDefaultAsManual('userPrincipalName')"
          />
        </UFormField>
        <UFormField label="Email" size="lg">
          <UInput
            v-model="props.controller.form.mail"
            class="w-full"
            :placeholder="`john.doe@${props.defaultMailDomain}`"
            @input="props.controller.markDefaultAsManual('mail')"
          />
        </UFormField>
        <UFormField label="Temporary password" size="lg" class="xl:col-span-2">
          <div class="flex flex-wrap gap-3">
            <UInput
              v-model="props.controller.form.password"
              class="min-w-[260px] flex-1"
            />
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-refresh-cw"
              @click="props.controller.regeneratePassword"
            >
              Regenerate
            </UButton>
          </div>
        </UFormField>
        <UFormField label="Account expiry" size="lg">
          <UInput
            v-model="props.controller.form.accountExpiresAt"
            type="datetime-local"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Enabled after creation"
          size="lg"
          class="md:col-span-2 xl:col-span-3"
        >
          <USwitch v-model="props.controller.form.enabled" />
        </UFormField>
        <UFormField
          label="Description"
          size="lg"
          class="md:col-span-2 xl:col-span-3"
        >
          <UTextarea
            v-model="props.controller.form.description"
            class="w-full"
            :rows="3"
            @input="props.controller.markDefaultAsManual('description')"
          />
        </UFormField>
        <UFormField
          label="Users OU distinguished name"
          size="lg"
          class="md:col-span-2 xl:col-span-3"
        >
          <UInput
            v-model="props.controller.form.ouDistinguishedName"
            class="w-full"
            placeholder="OU=Users,DC=example,DC=local"
          />
        </UFormField>
      </div>

      <div class="space-y-4">
        <DirectoryTypeahead
          v-model="groupQuery"
          label="Initial groups"
          :options="groupOptions"
          :loading="props.controller.groupSearch.loading"
          :error="props.controller.groupSearch.error"
          placeholder="Search groups to add on creation"
          empty-text="No matching Active Directory groups."
          @select="props.controller.handleGroupSelect"
        />
        <DirectoryGroupList
          title="Initial groups"
          description="These groups will be added after the user object is created."
          :groups="props.controller.form.initialGroups"
          empty-text="No initial groups selected."
          action-label="Remove"
          @action="props.controller.removeInitialGroup"
        />
      </div>
    </div>
  </UPageCard>
</template>
