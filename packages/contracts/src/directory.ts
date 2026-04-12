export interface DirectoryObjectRef {
  distinguishedName?: string;
  samAccountName?: string;
  objectGuid?: string;
  objectSid?: string;
  displayName?: string;
}

export interface DirectoryGroupView extends DirectoryObjectRef {
  distinguishedName: string;
  samAccountName?: string;
  displayName?: string;
}

export interface DirectoryGroupMemberView extends DirectoryObjectRef {
  distinguishedName: string;
  samAccountName?: string;
  displayName?: string;
  memberType?: "user" | "group" | "unknown";
}

export interface DirectoryGroupDetailView extends DirectoryGroupView {
  description: string | null;
  members: DirectoryGroupMemberView[];
}

export interface DirectoryAccountView extends DirectoryObjectRef {
  samAccountName: string;
  distinguishedName: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName?: string;
  department?: string;
  title?: string;
  company?: string;
  telephoneNumber?: string;
  description: string | null;
  enabled: boolean | null;
  accountExpiresAt: string | null;
  groupMemberships: DirectoryGroupView[];
}

export interface DirectoryUserSearchHit extends DirectoryObjectRef {
  samAccountName: string;
  distinguishedName: string;
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
}

export interface DirectoryUserSearchResult {
  query: string;
  results: DirectoryUserSearchHit[];
}

export interface DirectoryGroupSearchResult {
  query: string;
  results: DirectoryGroupView[];
}
