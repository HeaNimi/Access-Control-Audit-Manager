export default defineNuxtRouteMiddleware(async () => {
  const { token, user, ensureHydrated, ensureSession } = useAuth();

  ensureHydrated();

  if (token.value) {
    try {
      await ensureSession();
    } catch {
      // If the API is temporarily unavailable, fall through to the stored session.
    }
  }

  if (!token.value || !user.value) {
    return navigateTo("/login");
  }
});
