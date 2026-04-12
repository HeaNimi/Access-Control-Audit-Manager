import type {
  ChangeRequestPayload,
  DirectoryGroupMemberView,
  DirectoryGroupView,
  DirectoryUserSearchHit,
} from '@acam-ts/contracts';

import type { LdapEntry } from './directory.types';

export function readRawAttribute(
  entry: LdapEntry,
  ...names: string[]
): unknown {
  const keys = Object.keys(entry);

  for (const name of names) {
    const key = keys.find(
      (candidate) => candidate.toLowerCase() === name.toLowerCase(),
    );

    if (key) {
      return entry[key];
    }
  }

  return undefined;
}

export function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => toStringValue(entry))
      .find((entry): entry is string => !!entry);
  }

  return undefined;
}

export function toBinaryValue(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => toBinaryValue(entry))
      .find((entry): entry is Buffer => !!entry);
  }

  return undefined;
}

export function readStringAttribute(
  entry: LdapEntry,
  ...names: string[]
): string | undefined {
  const rawValue = readRawAttribute(entry, ...names);

  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  return toStringValue(rawValue);
}

export function readStringArray(
  entry: LdapEntry,
  ...names: string[]
): string[] {
  const rawValue = readRawAttribute(entry, ...names);

  if (rawValue === undefined || rawValue === null) {
    return [];
  }

  const values = Array.isArray(rawValue) ? rawValue : [rawValue];

  return values
    .map((value) => toStringValue(value))
    .filter((value): value is string => !!value);
}

export function readEnabledState(
  entry: LdapEntry,
  ...names: string[]
): boolean | null {
  const rawValue = readStringAttribute(entry, ...names);

  if (!rawValue) {
    return null;
  }

  const userAccountControl = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(userAccountControl)) {
    return null;
  }

  return (userAccountControl & 2) === 0;
}

export function readAccountExpiresAttribute(
  entry: LdapEntry,
  ...names: string[]
): string | null {
  const rawValue = readStringAttribute(entry, ...names);

  if (!rawValue) {
    return null;
  }

  return accountExpiresToIsoString(rawValue);
}

export function readGuidAttribute(
  entry: LdapEntry,
  ...names: string[]
): string | undefined {
  const rawValue = readRawAttribute(entry, ...names);

  if (typeof rawValue === 'string' && rawValue) {
    return rawValue;
  }

  const buffer = toBinaryValue(rawValue);

  if (!buffer || buffer.length !== 16) {
    return undefined;
  }

  const hex = buffer.toString('hex');

  return [
    `${hex.slice(6, 8)}${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`,
    `${hex.slice(10, 12)}${hex.slice(8, 10)}`,
    `${hex.slice(14, 16)}${hex.slice(12, 14)}`,
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function readSidAttribute(
  entry: LdapEntry,
  ...names: string[]
): string | undefined {
  const rawValue = readRawAttribute(entry, ...names);

  if (typeof rawValue === 'string' && rawValue) {
    return rawValue;
  }

  const buffer = toBinaryValue(rawValue);

  if (!buffer || buffer.length < 8) {
    return undefined;
  }

  const revision = buffer.readUInt8(0);
  const subAuthorityCount = buffer.readUInt8(1);
  let authority = 0n;

  for (let index = 2; index < 8; index += 1) {
    authority = (authority << 8n) | BigInt(buffer.readUInt8(index));
  }

  const parts = [`S-${revision}-${authority.toString()}`];

  for (let index = 0; index < subAuthorityCount; index += 1) {
    const offset = 8 + index * 4;

    if (offset + 4 > buffer.length) {
      break;
    }

    parts.push(buffer.readUInt32LE(offset).toString());
  }

  return parts.join('-');
}

export function getDirectoryMemberType(
  entry: LdapEntry,
): DirectoryGroupMemberView['memberType'] {
  const classes = readStringArray(entry, 'objectClass').map((value) =>
    value.toLowerCase(),
  );

  if (classes.includes('group')) {
    return 'group';
  }

  if (classes.includes('user') || classes.includes('person')) {
    return 'user';
  }

  return 'unknown';
}

export function escapeLdapFilterValue(value: string): string {
  return value.replace(/[\0()*\\]/g, (character) => {
    switch (character) {
      case '\\':
        return '\\5c';
      case '*':
        return '\\2a';
      case '(':
        return '\\28';
      case ')':
        return '\\29';
      case '\0':
        return '\\00';
      default:
        return character;
    }
  });
}

export function deriveUpnSuffix(baseDn?: string): string | undefined {
  if (!baseDn) {
    return undefined;
  }

  const labels = baseDn
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.toUpperCase().startsWith('DC='))
    .map((part) => part.slice(3));

  return labels.length > 0 ? labels.join('.') : undefined;
}

export function accountExpiresToIsoString(value: string): string | null {
  const trimmedValue = value.trim();

  if (
    trimmedValue.length === 0 ||
    trimmedValue === '0' ||
    trimmedValue === '9223372036854775807'
  ) {
    return null;
  }

  const fileTime = BigInt(trimmedValue);
  const unixMilliseconds = Number((fileTime - 116444736000000000n) / 10000n);

  if (!Number.isFinite(unixMilliseconds) || unixMilliseconds <= 0) {
    return null;
  }

  return new Date(unixMilliseconds).toISOString();
}

export function isoStringToAccountExpires(
  value: string | null | undefined,
): string {
  if (!value) {
    return '0';
  }

  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    return '0';
  }

  return (BigInt(timestamp) * 10000n + 116444736000000000n).toString();
}

export function encodeUnicodePassword(password: string): Buffer {
  return Buffer.from(`"${password}"`, 'utf16le');
}

export function parseEnabledValue(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return ['true', '1', 'yes', 'enabled'].includes(normalized);
}

export function getUserAccountControlValue(enabled: boolean): string {
  return enabled ? '512' : '514';
}

export function getGroupKey(group: DirectoryGroupView): string {
  return (
    group.objectGuid ??
    group.samAccountName?.toLowerCase() ??
    group.displayName?.toLowerCase() ??
    group.distinguishedName.toLowerCase()
  );
}

export function sortGroups(groups: DirectoryGroupView[]): DirectoryGroupView[] {
  return [...groups].sort((left, right) =>
    (
      left.displayName ??
      left.samAccountName ??
      left.distinguishedName
    ).localeCompare(
      right.displayName ?? right.samAccountName ?? right.distinguishedName,
    ),
  );
}

export function sortMembers(
  members: DirectoryGroupMemberView[],
): DirectoryGroupMemberView[] {
  return [...members].sort((left, right) =>
    (
      left.displayName ??
      left.samAccountName ??
      left.distinguishedName
    ).localeCompare(
      right.displayName ?? right.samAccountName ?? right.distinguishedName,
    ),
  );
}

export function buildPrimaryGroupSid(
  objectSid?: string,
  primaryGroupIdValue?: string,
): string | undefined {
  if (!objectSid || !primaryGroupIdValue) {
    return undefined;
  }

  const primaryGroupId = Number.parseInt(primaryGroupIdValue, 10);

  if (!Number.isInteger(primaryGroupId)) {
    return undefined;
  }

  const sidParts = objectSid.split('-');

  if (sidParts.length < 2) {
    return undefined;
  }

  return [...sidParts.slice(0, -1), String(primaryGroupId)].join('-');
}

export function buildRecursiveMemberOfClause(groupDns: string[]): string {
  const filteredDns = groupDns
    .map((groupDn) => groupDn.trim())
    .filter((groupDn) => groupDn.length > 0);

  if (filteredDns.length === 0) {
    return '';
  }

  if (filteredDns.length === 1) {
    return `(memberOf:1.2.840.113556.1.4.1941:=${escapeLdapFilterValue(filteredDns[0])})`;
  }

  return `(|${filteredDns
    .map(
      (groupDn) =>
        `(memberOf:1.2.840.113556.1.4.1941:=${escapeLdapFilterValue(groupDn)})`,
    )
    .join('')})`;
}

export function buildUserSearchFilter(
  query: string,
  groupDns: string[],
): string {
  const escapedQuery = escapeLdapFilterValue(query);
  const clauses = [
    '(objectCategory=person)',
    '(objectClass=user)',
    `(|(sAMAccountName=*${escapedQuery}*)(displayName=*${escapedQuery}*)(givenName=*${escapedQuery}*)(sn=*${escapedQuery}*)(userPrincipalName=*${escapedQuery}*))`,
  ];

  if (groupDns.length > 0) {
    clauses.push(buildRecursiveMemberOfClause(groupDns));
  }

  return `(&${clauses.join('')})`;
}

export function getUserKey(user: DirectoryUserSearchHit): string {
  return (
    user.objectGuid ||
    user.samAccountName.toLowerCase() ||
    user.displayName?.toLowerCase() ||
    user.distinguishedName.toLowerCase()
  );
}

export function mapGroupEntry(
  entry: LdapEntry,
): DirectoryGroupView | undefined {
  const distinguishedName =
    readStringAttribute(entry, 'distinguishedName', 'dn') ?? '';

  if (!distinguishedName) {
    return undefined;
  }

  return {
    distinguishedName,
    samAccountName: readStringAttribute(entry, 'sAMAccountName'),
    displayName:
      readStringAttribute(entry, 'displayName') ??
      readStringAttribute(entry, 'cn'),
    objectGuid: readGuidAttribute(entry, 'objectGUID'),
  };
}

export function mapMemberEntry(
  entry: LdapEntry,
): DirectoryGroupMemberView | undefined {
  const distinguishedName =
    readStringAttribute(entry, 'distinguishedName', 'dn') ?? '';

  if (!distinguishedName) {
    return undefined;
  }

  return {
    distinguishedName,
    samAccountName: readStringAttribute(entry, 'sAMAccountName'),
    displayName:
      readStringAttribute(entry, 'displayName') ??
      readStringAttribute(entry, 'cn'),
    objectGuid: readGuidAttribute(entry, 'objectGUID'),
    memberType: getDirectoryMemberType(entry),
  };
}

export function mapUserSearchHit(
  entry: LdapEntry,
): DirectoryUserSearchHit | undefined {
  const distinguishedName =
    readStringAttribute(entry, 'distinguishedName', 'dn') ?? '';
  const samAccountName = readStringAttribute(entry, 'sAMAccountName') ?? '';

  if (!distinguishedName || !samAccountName) {
    return undefined;
  }

  return {
    distinguishedName,
    samAccountName,
    displayName:
      readStringAttribute(entry, 'displayName') ??
      readStringAttribute(entry, 'cn'),
    userPrincipalName: readStringAttribute(entry, 'userPrincipalName'),
    mail: readStringAttribute(entry, 'mail'),
    objectGuid: readGuidAttribute(entry, 'objectGUID'),
  };
}

export function mergeGroups(
  ...groupSets: DirectoryGroupView[][]
): DirectoryGroupView[] {
  const groups = new Map<string, DirectoryGroupView>();

  for (const groupSet of groupSets) {
    for (const group of groupSet) {
      groups.set(getGroupKey(group), group);
    }
  }

  return sortGroups(Array.from(groups.values()));
}

export function getFailureIdentifier(
  payload: ChangeRequestPayload,
): string | undefined {
  switch (payload.kind) {
    case 'user_create':
      return payload.target.samAccountName;
    case 'account_change':
    case 'group_change':
    case 'account_update':
      return payload.target.samAccountName;
    case 'group_membership_add':
    case 'group_membership_remove':
      return payload.member.samAccountName;
  }
}

export function getRawErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return 'Active Directory operation failed.';
}

export function isRetryableLdapSocketError(error: unknown): boolean {
  const message = getRawErrorMessage(error).toLowerCase();

  return (
    message.includes(
      'connection closed before message response was received',
    ) ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('connection reset')
  );
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}
