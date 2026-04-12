import type { RoleCode } from "@acam-ts/contracts";

import { canAccessRoute } from "../utils/access";

export default defineNuxtRouteMiddleware((to) => {
  const { user, ensureHydrated } = useAuth();

  ensureHydrated();

  const allowedRoles = to.meta.allowedRoles as RoleCode[] | undefined;

  if (!allowedRoles || allowedRoles.length === 0) {
    return;
  }

  if (!canAccessRoute(user.value?.roles, allowedRoles)) {
    return navigateTo("/requests");
  }
});
