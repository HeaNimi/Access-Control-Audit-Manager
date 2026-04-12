<script setup lang="ts">
import { canAccessRoute, navigationItems } from "../utils/access";

const route = useRoute();
const { user, ensureHydrated, logout } = useAuth();

const visibleNavigationItems = computed(() =>
  navigationItems
    .filter((item) => canAccessRoute(user.value?.roles, item.allowedRoles))
    .map((item) => ({
      ...item,
      children: item.children?.filter((child) =>
        canAccessRoute(user.value?.roles, child.allowedRoles),
      ),
    })),
);

function getNavigationIcon(path: string) {
  return path === "/requests"
    ? "i-lucide-list-checks"
    : path === "/requests/new"
      ? "i-lucide-plus-circle"
      : path === "/observed-events"
        ? "i-lucide-radar"
        : path === "/audit"
          ? "i-lucide-scroll-text"
          : path === "/settings/logs"
            ? "i-lucide-file-text"
            : path === "/settings/config"
              ? "i-lucide-sliders-horizontal"
              : "i-lucide-settings-2";
}

function isNavigationItemActive(path: string) {
  return path === "/requests"
    ? route.path === "/requests"
    : route.path === path || route.path.startsWith(`${path}/`);
}

const navItems = computed(() =>
  visibleNavigationItems.value.map((item) => ({
    label: item.label,
    icon: getNavigationIcon(item.to),
    to: item.to,
    active: isNavigationItemActive(item.to),
    children: item.children?.map((child) => ({
      label: child.label,
      icon: getNavigationIcon(child.to),
      to: child.to,
      active: isNavigationItemActive(child.to),
    })),
  })),
);

const currentPageTitle = computed(() => {
  const childMatch = visibleNavigationItems.value
    .flatMap((item) => item.children ?? [])
    .find((item) => item.to === route.path);
  const match =
    childMatch ??
    visibleNavigationItems.value.find((item) => item.to === route.path) ??
    visibleNavigationItems.value.find((item) =>
      route.path.startsWith(item.to) && item.to !== "/requests",
    );

  return match?.label ?? "ACAM-TS";
});

const profileInitial = computed(
  () =>
    user.value?.displayName?.trim().charAt(0).toUpperCase() ||
    user.value?.username?.trim().charAt(0).toUpperCase() ||
    "U",
);

ensureHydrated();

function signOut() {
  logout();
  navigateTo("/login");
}
</script>

<template>
  <div
    v-if="route.path === '/login' || !user"
    class="min-h-screen"
  >
    <slot />
  </div>

  <UDashboardGroup
    v-else
    class="min-h-screen"
    storage="local"
    storage-key="acam-ts.dashboard"
  >
    <UDashboardSidebar
      collapsible
      resizable
      :default-size="15"
      :min-size="11"
      :max-size="20"
      :ui="{
        content: 'px-3 py-4'
      }"
    >
      <template #header="{ collapsed }">
        <div class="px-1">
          <div class="text-sm font-semibold tracking-wide">
            {{ collapsed ? "AC" : "Active Directory change management" }}
          </div>
        </div>
      </template>

      <template #default="{ collapsed }">
        <div class="space-y-3">
          <div class="space-y-1.5">
            <template v-for="item in navItems" :key="item.to">
              <div class="space-y-1">
                <UTooltip
                  :text="item.label"
                  :disabled="!collapsed"
                >
                  <UButton
                    :to="item.children?.length ? item.children[0].to : item.to"
                    color="neutral"
                    :variant="item.active ? 'soft' : 'ghost'"
                    :icon="item.icon"
                    :square="collapsed"
                    :class="
                      collapsed
                        ? 'w-9 h-9 justify-center rounded-xl'
                        : 'w-full justify-start rounded-xl px-3 py-2.5'
                    "
                  >
                    <span v-if="!collapsed">{{ item.label }}</span>
                  </UButton>
                </UTooltip>

                <div
                  v-if="!collapsed && item.children?.length && item.active"
                  class="space-y-1 pl-4"
                >
                  <UButton
                    v-for="child in item.children"
                    :key="child.to"
                    :to="child.to"
                    color="neutral"
                    :variant="child.active ? 'soft' : 'ghost'"
                    :icon="child.icon"
                    class="w-full justify-start rounded-xl px-3 py-2 text-sm"
                  >
                    {{ child.label }}
                  </UButton>
                </div>
              </div>
            </template>
          </div>

          <UPopover
            :content="{
              align: 'start',
              side: 'right',
              sideOffset: 10
            }"
          >
            <UButton
              color="neutral"
              variant="soft"
              :square="collapsed"
              :class="
                collapsed
                  ? 'w-9 h-9 justify-center rounded-xl'
                  : 'w-full justify-start gap-3 rounded-xl px-3 py-2.5'
              "
            >
              <UAvatar
                :alt="user.displayName"
                :text="profileInitial"
                size="md"
              />
              <div v-if="!collapsed" class="min-w-0 text-left">
                <div class="truncate font-medium">
                  {{ user.displayName }}
                </div>
                <div class="truncate text-xs text-muted">
                  {{ user.username }}
                </div>
              </div>
            </UButton>

            <template #content>
              <UCard class="w-72">
                <div class="space-y-4">
                  <div class="flex flex-col items-center gap-3 text-center">
                    <UAvatar
                      :alt="user.displayName"
                      :text="profileInitial"
                      size="3xl"
                    />
                    <div class="space-y-1">
                      <div class="text-base font-semibold">
                        {{ user.displayName }}
                      </div>
                      <div class="font-mono text-sm text-muted">
                        {{ user.username }}
                      </div>
                      <div class="text-sm text-muted">
                        {{ user.authProvider.toUpperCase() }} authentication
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="role in user.roles"
                      :key="role"
                      color="neutral"
                      variant="soft"
                      class="capitalize"
                    >
                      {{ role }}
                    </UBadge>
                  </div>

                  <USeparator />

                  <UButton
                    color="error"
                    variant="outline"
                    icon="i-lucide-log-out"
                    block
                    @click="signOut"
                  >
                    Sign out
                  </UButton>
                </div>
              </UCard>
            </template>
          </UPopover>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel
      :ui="{
        body: 'px-5 py-5 sm:px-6 lg:px-8 lg:py-6'
      }"
    >
      <template #header>
        <UDashboardNavbar :title="currentPageTitle" icon="i-lucide-shield-check">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #trailing>
            <div class="hidden items-center gap-2 sm:flex">
              <UBadge
                v-for="role in user.roles.slice(0, 2)"
                :key="role"
                color="neutral"
                variant="soft"
                class="capitalize"
              >
                {{ role }}
              </UBadge>
            </div>
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
