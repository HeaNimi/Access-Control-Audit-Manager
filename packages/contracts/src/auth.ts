export const ROLE_CODES = [
  "requester",
  "approver",
  "auditor",
  "administrator",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const AUTH_PROVIDERS = ["ldap", "local"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface AuthenticatedUserProfile {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  roles: RoleCode[];
  authProvider: AuthProvider;
}

export interface AuthLoginResponse {
  accessToken: string;
  user: AuthenticatedUserProfile;
}

export interface AuthUserSearchHit {
  username: string;
  displayName: string;
  email: string | null;
  roles: RoleCode[];
  authProvider: AuthProvider;
  distinguishedName: string | null;
}

export interface AuthUserSearchResult {
  query: string;
  role?: RoleCode;
  results: AuthUserSearchHit[];
}

export type DemoUserProfile = AuthenticatedUserProfile;
export type DemoLoginResponse = AuthLoginResponse;
