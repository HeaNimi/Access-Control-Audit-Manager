import type {
  AuthLoginResponse,
  AuthenticatedUserProfile,
} from "@acam-ts/contracts";
import { toErrorMessage } from "../utils/errors";

const AUTH_TOKEN_KEY = "acam-ts.token";
const AUTH_USER_KEY = "acam-ts.user";

interface ApiErrorShape {
  message: string;
  statusCode?: number;
}

export function useAuth() {
  const config = useRuntimeConfig();
  const token = useState<string | null>("auth-token", () => null);
  const user = useState<AuthenticatedUserProfile | null>("auth-user", () => null);
  const hydrated = useState<boolean>("auth-hydrated", () => false);
  const sessionResolved = useState<boolean>("auth-session-resolved", () => false);

  function ensureHydrated() {
    if (!import.meta.client || hydrated.value) {
      return;
    }

    token.value = localStorage.getItem(AUTH_TOKEN_KEY);

    const storedUser = localStorage.getItem(AUTH_USER_KEY);
    user.value = storedUser ? (JSON.parse(storedUser) as AuthenticatedUserProfile) : null;
    hydrated.value = true;
  }

  async function login(username: string, password: string) {
    const response = await request<AuthLoginResponse>("/auth/login", {
      method: "POST",
      body: { username, password },
    });

    setSession(response);
    return response.user;
  }

  async function ensureSession() {
    ensureHydrated();

    if (!token.value) {
      sessionResolved.value = true;
      return null;
    }

    if (sessionResolved.value && user.value) {
      return user.value;
    }

    try {
      const profile = await request<AuthenticatedUserProfile>("/auth/me", {
        headers: {
          Authorization: `Bearer ${token.value}`,
        },
      });

      user.value = profile;
      sessionResolved.value = true;

      if (import.meta.client) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(profile));
      }

      return profile;
    } catch (caught) {
      const error = normalizeError(caught);

      if (error.statusCode === 401) {
        logout();
        sessionResolved.value = true;
        return null;
      }

      throw new Error(error.message);
    }
  }

  function logout() {
    token.value = null;
    user.value = null;
    sessionResolved.value = false;

    if (import.meta.client) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
  }

  function setSession(response: AuthLoginResponse) {
    token.value = response.accessToken;
    user.value = response.user;
    sessionResolved.value = true;

    if (import.meta.client) {
      localStorage.setItem(AUTH_TOKEN_KEY, response.accessToken);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(response.user));
    }
  }

  async function request<T>(
    path: string,
    options: Parameters<typeof $fetch<T>>[1] = {},
  ) {
    try {
      return await $fetch<T>(path, {
        baseURL: config.public.apiBaseUrl,
        ...options,
      });
    } catch (caught) {
      const error = normalizeError(caught);
      throw Object.assign(new Error(error.message), {
        statusCode: error.statusCode,
      });
    }
  }

  function normalizeError(caught: unknown): ApiErrorShape {
    if (
      typeof caught === "object" &&
      caught !== null &&
      "data" in caught &&
      typeof (caught as { data?: unknown }).data === "object" &&
      (caught as { data?: { message?: unknown; statusCode?: unknown } }).data !== null
    ) {
      const data = (caught as { data: { message?: unknown; statusCode?: unknown } }).data;
      return {
        message:
          typeof data.message === "string"
            ? data.message
            : toErrorMessage(caught, "Authentication request failed."),
        statusCode:
          typeof data.statusCode === "number" ? data.statusCode : undefined,
      };
    }

    return {
      message: toErrorMessage(caught, "Authentication request failed."),
    };
  }

  return {
    token,
    user,
    ensureHydrated,
    ensureSession,
    login,
    logout,
  };
}
