<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";
import type {
  DirectoryGroupSearchResult,
  DirectoryGroupView,
  UserCreationTemplateInput,
  UserCreationTemplateView,
} from "@acam-ts/contracts";

import { useDirectoryTypeahead } from "../../composables/useDirectoryTypeahead";
import type { TypeaheadOption } from "../../types/ui";
import { cloneGroup, groupKey } from "../../utils/directory";
import { toErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/request-helpers";

definePageMeta({
  middleware: ["auth", "access"],
  allowedRoles: ["administrator"],
});

const toast = useToast();
const UBadge = resolveComponent("UBadge");
const UButton = resolveComponent("UButton");

const templates = ref<UserCreationTemplateView[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const saving = ref(false);
const drawerOpen = ref(false);
const editingTemplate = ref<UserCreationTemplateView | null>(null);
const groupQuery = ref("");

const form = reactive({
  templateName: "",
  description: "",
  isActive: true,
  sortOrder: "0",
  ouDistinguishedName: "",
  enabledDefault: true,
  accountExpiresOffsetDays: "",
  descriptionTemplate: "",
  upnSuffix: "",
  mailDomain: "",
  groups: [] as DirectoryGroupView[],
});

const groupSearch = useDirectoryTypeahead<DirectoryGroupView>(
  groupQuery,
  async (requestQuery) => {
    const response = await useApi<DirectoryGroupSearchResult>(
      `/directory/groups/search?query=${encodeURIComponent(requestQuery)}`,
    );

    return response.results;
  },
  {
    fallbackError: "Failed to search Active Directory groups.",
  },
);

const groupOptions = computed<TypeaheadOption[]>(() =>
  groupSearch.results.map((group) => ({
    id: groupKey(group),
    title: group.displayName || group.samAccountName || group.distinguishedName,
    subtitle: group.samAccountName,
    meta: group.distinguishedName,
  })),
);

const columns: TableColumn<UserCreationTemplateView>[] = [
  {
    accessorKey: "templateName",
    header: "Template",
    meta: { class: { td: "min-w-[260px] whitespace-normal" } },
    cell: ({ row }) =>
      h("div", { class: "min-w-0 space-y-1" }, [
        h(
          "div",
          { class: "font-medium text-highlighted" },
          row.original.templateName,
        ),
        row.original.description
          ? h("div", { class: "text-sm text-muted" }, row.original.description)
          : null,
      ]),
  },
  {
    accessorKey: "isActive",
    header: "State",
    cell: ({ row }) =>
      h(
        UBadge,
        {
          color: row.original.isActive ? "success" : "neutral",
          variant: "soft",
        },
        () => (row.original.isActive ? "Active" : "Inactive"),
      ),
  },
  {
    accessorKey: "ouDistinguishedName",
    header: "OU",
    meta: { class: { td: "max-w-md whitespace-normal" } },
    cell: ({ row }) =>
      h(
        "span",
        { class: "text-sm text-muted [overflow-wrap:anywhere]" },
        row.original.ouDistinguishedName || "Runtime default",
      ),
  },
  {
    accessorKey: "groupCount",
    header: "Groups",
    cell: ({ row }) => String(row.original.groupCount),
  },
  {
    accessorKey: "templateVersion",
    header: "Version",
    cell: ({ row }) => `v${row.original.templateVersion}`,
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
  {
    id: "actions",
    header: "",
    meta: { class: { td: "text-right" } },
    cell: ({ row }) =>
      h(
        UButton,
        {
          color: "neutral",
          variant: "ghost",
          size: "sm",
          icon: "i-lucide-pencil",
          onClick: () => openEdit(row.original),
        },
        () => "Edit",
      ),
  },
];

function nullableText(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function buildPayload(): UserCreationTemplateInput {
  const expiryOffset = form.accountExpiresOffsetDays.trim()
    ? Number(form.accountExpiresOffsetDays)
    : null;

  return {
    templateName: form.templateName.trim(),
    description: nullableText(form.description),
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder || 0),
    ouDistinguishedName: nullableText(form.ouDistinguishedName),
    enabledDefault: form.enabledDefault,
    accountExpiresOffsetDays: expiryOffset,
    descriptionTemplate: nullableText(form.descriptionTemplate),
    upnSuffix: nullableText(form.upnSuffix),
    mailDomain: nullableText(form.mailDomain),
    groups: form.groups.map((group, index) => ({
      ...cloneGroup(group),
      sortOrder: index,
    })),
  };
}

async function loadTemplates() {
  loading.value = true;
  error.value = null;

  try {
    templates.value = await useApi<UserCreationTemplateView[]>(
      "/user-creation-templates?includeInactive=true",
    );
  } catch (caught) {
    templates.value = [];
    error.value = toErrorMessage(
      caught,
      "Failed to load user creation templates.",
    );
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  form.templateName = "";
  form.description = "";
  form.isActive = true;
  form.sortOrder = "0";
  form.ouDistinguishedName = "";
  form.enabledDefault = true;
  form.accountExpiresOffsetDays = "";
  form.descriptionTemplate = "";
  form.upnSuffix = "";
  form.mailDomain = "";
  form.groups = [];
  groupQuery.value = "";
  groupSearch.results = [];
  groupSearch.error = null;
}

function openCreate() {
  editingTemplate.value = null;
  resetForm();
  drawerOpen.value = true;
}

function openEdit(template: UserCreationTemplateView) {
  editingTemplate.value = template;
  form.templateName = template.templateName;
  form.description = template.description ?? "";
  form.isActive = template.isActive;
  form.sortOrder = String(template.sortOrder);
  form.ouDistinguishedName = template.ouDistinguishedName ?? "";
  form.enabledDefault = template.enabledDefault ?? true;
  form.accountExpiresOffsetDays =
    template.accountExpiresOffsetDays === null
      ? ""
      : String(template.accountExpiresOffsetDays);
  form.descriptionTemplate = template.descriptionTemplate ?? "";
  form.upnSuffix = template.upnSuffix ?? "";
  form.mailDomain = template.mailDomain ?? "";
  form.groups = template.groups.map(cloneGroup);
  groupQuery.value = "";
  groupSearch.results = [];
  groupSearch.error = null;
  drawerOpen.value = true;
}

function handleGroupSelect(groupId: string) {
  const group = groupSearch.results.find(
    (entry) => groupKey(entry) === groupId,
  );

  if (
    !group ||
    form.groups.some((entry) => groupKey(entry) === groupKey(group))
  ) {
    return;
  }

  form.groups = [...form.groups, cloneGroup(group)];
  groupQuery.value = "";
  groupSearch.results = [];
}

function removeGroup(group: DirectoryGroupView) {
  form.groups = form.groups.filter(
    (entry) => groupKey(entry) !== groupKey(group),
  );
}

async function saveTemplate() {
  saving.value = true;

  try {
    const payload = buildPayload();
    const path = editingTemplate.value
      ? `/user-creation-templates/${editingTemplate.value.templateId}`
      : "/user-creation-templates";

    await useApi<UserCreationTemplateView>(path, {
      method: editingTemplate.value ? "PATCH" : "POST",
      body: payload,
    });
    drawerOpen.value = false;
    toast.add({
      color: "success",
      icon: "i-lucide-check",
      description: editingTemplate.value
        ? "User creation template updated."
        : "User creation template created.",
    });
    await loadTemplates();
  } catch (caught) {
    toast.add({
      color: "error",
      icon: "i-lucide-circle-alert",
      description: toErrorMessage(caught, "Failed to save template."),
    });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadTemplates();
});
</script>

<template>
  <UPage>
    <UPageHeader
      title="User templates"
      description="Configure editable defaults for user creation requests."
    >
      <template #links>
        <UButton icon="i-lucide-plus" @click="openCreate">
          New template
        </UButton>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-refresh-cw"
          @click="loadTemplates"
        >
          Refresh
        </UButton>
      </template>
    </UPageHeader>

    <UPageBody>
      <UPageCard
        title="Configured templates"
        description="Active templates are available on the user creation request form."
        variant="subtle"
      >
        <AsyncState
          :loading="loading"
          :error="error"
          :empty="!loading && !error && templates.length === 0"
          loading-description="Loading user creation templates…"
          empty-description="No user creation templates configured."
        >
          <div class="overflow-x-auto">
            <UTable :data="templates" :columns="columns" class="min-w-full" />
          </div>
        </AsyncState>
      </UPageCard>
    </UPageBody>

    <UDrawer
      v-model:open="drawerOpen"
      direction="right"
      :handle="false"
      :dismissible="true"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #content>
        <div class="flex h-full w-full flex-col bg-default">
          <div
            class="flex items-start justify-between gap-4 border-b border-default px-6 py-5"
          >
            <div class="space-y-1">
              <h3 class="text-lg font-semibold text-highlighted">
                {{ editingTemplate ? "Edit template" : "New template" }}
              </h3>
              <p class="text-sm text-muted">
                Store reusable defaults for user creation.
              </p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              @click="drawerOpen = false"
            />
          </div>

          <div class="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Template name" size="lg">
                <UInput v-model="form.templateName" class="w-full" />
              </UFormField>
              <UFormField label="Sort order" size="lg">
                <UInput v-model="form.sortOrder" type="number" class="w-full" />
              </UFormField>
              <UFormField label="Active" size="lg">
                <USwitch v-model="form.isActive" />
              </UFormField>
              <UFormField label="Enabled after creation" size="lg">
                <USwitch v-model="form.enabledDefault" />
              </UFormField>
              <UFormField label="UPN suffix" size="lg">
                <UInput
                  v-model="form.upnSuffix"
                  placeholder="example.local"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Mail domain" size="lg">
                <UInput
                  v-model="form.mailDomain"
                  placeholder="example.local"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Account expiry offset days" size="lg">
                <UInput
                  v-model="form.accountExpiresOffsetDays"
                  type="number"
                  min="1"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Users OU distinguished name" size="lg">
                <UInput
                  v-model="form.ouDistinguishedName"
                  placeholder="OU=Users,DC=example,DC=local"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Description" size="lg" class="md:col-span-2">
                <UTextarea
                  v-model="form.description"
                  :rows="2"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                label="Account description template"
                size="lg"
                class="md:col-span-2"
              >
                <UTextarea
                  v-model="form.descriptionTemplate"
                  :rows="3"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="space-y-4">
              <DirectoryTypeahead
                v-model="groupQuery"
                label="Initial groups"
                :options="groupOptions"
                :loading="groupSearch.loading"
                :error="groupSearch.error"
                placeholder="Search groups to add to this template"
                empty-text="No matching Active Directory groups."
                @select="handleGroupSelect"
              />
              <DirectoryGroupList
                title="Initial groups"
                description="These groups are applied as editable defaults."
                :groups="form.groups"
                empty-text="No initial groups selected."
                action-label="Remove"
                @action="removeGroup"
              />
            </div>
          </div>

          <div class="flex justify-end gap-3 border-t border-default px-6 py-4">
            <UButton
              color="neutral"
              variant="outline"
              @click="drawerOpen = false"
            >
              Cancel
            </UButton>
            <UButton
              icon="i-lucide-save"
              :loading="saving"
              @click="saveTemplate"
            >
              Save template
            </UButton>
          </div>
        </div>
      </template>
    </UDrawer>
  </UPage>
</template>
