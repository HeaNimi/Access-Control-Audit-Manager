export function useApi<T>(
  path: string,
  options: Parameters<typeof $fetch<T>>[1] = {},
) {
  const config = useRuntimeConfig();
  const { token, ensureHydrated, logout } = useAuth();
  const route = useRoute();

  ensureHydrated();

  return $fetch<T>(path, {
    baseURL: config.public.apiBaseUrl,
    ...options,
    headers: {
      ...(token.value ? { Authorization: `Bearer ${token.value}` } : {}),
      ...(options.headers ?? {}),
    },
  }).catch((error: unknown) => {
    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "data" in error &&
      typeof (error as { data?: { statusCode?: unknown } }).data === "object" &&
      typeof (error as { data?: { statusCode?: unknown } }).data?.statusCode === "number"
        ? (error as { data: { statusCode: number } }).data.statusCode
        : undefined;

    if (statusCode === 401) {
      logout();

      if (import.meta.client && route.path !== "/login") {
        void navigateTo("/login");
      }
    }

    const message =
      typeof error === "object" &&
      error !== null &&
      "data" in error &&
      typeof (error as { data?: unknown }).data === "object" &&
      (error as { data?: { message?: unknown } }).data !== null &&
      typeof (error as { data?: { message?: unknown } }).data?.message === "string"
        ? (error as { data: { message: string } }).data.message
        : error instanceof Error
          ? error.message
          : "API request failed.";

    throw new Error(message);
  });
}
