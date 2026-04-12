import type {
  AccountChangePayload,
  AccountAttributeChange,
  AccountChangeDirectorySnapshot,
  AccountUpdatePayload,
  ChangeRequestPayload,
  DirectoryAccountView,
  DirectoryGroupDetailView,
  DirectoryObjectRef,
  AccountGroupChange,
  DirectoryGroupView,
  GroupChangeDirectorySnapshot,
  GroupChangePayload,
  GroupMemberChange,
  GroupMembershipPayload,
  UserCreatePayload,
} from '@acam-ts/contracts';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asDirectoryObjectRef(
  value: unknown,
  label: string,
): DirectoryObjectRef {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return {
    distinguishedName:
      typeof value.distinguishedName === 'string'
        ? value.distinguishedName
        : undefined,
    samAccountName:
      typeof value.samAccountName === 'string'
        ? value.samAccountName
        : undefined,
    objectGuid:
      typeof value.objectGuid === 'string' ? value.objectGuid : undefined,
    objectSid:
      typeof value.objectSid === 'string' ? value.objectSid : undefined,
    displayName:
      typeof value.displayName === 'string' ? value.displayName : undefined,
  };
}

function hasDirectoryIdentity(value: DirectoryObjectRef): boolean {
  return !!(
    value.distinguishedName ||
    value.samAccountName ||
    value.objectGuid ||
    value.objectSid ||
    value.displayName
  );
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' || value === null ? value : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' || value === null ? value : null;
}

function asDirectoryGroupView(
  value: unknown,
  label: string,
): DirectoryGroupView {
  const group = asDirectoryObjectRef(value, label);

  if (!group.distinguishedName) {
    throw new Error(`${label}.distinguishedName is required.`);
  }

  return {
    ...group,
    distinguishedName: group.distinguishedName,
  };
}

function asDirectoryAccountView(
  value: unknown,
  label: string,
): DirectoryAccountView {
  const account = asDirectoryObjectRef(value, label);

  if (!account.samAccountName || !account.distinguishedName) {
    throw new Error(`${label} requires samAccountName and distinguishedName.`);
  }

  if (!isObject(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const source = value;

  return {
    ...account,
    samAccountName: account.samAccountName,
    distinguishedName: account.distinguishedName,
    givenName: asString(source.givenName),
    surname: asString(source.surname),
    mail: asString(source.mail),
    userPrincipalName: asString(source.userPrincipalName),
    department: asString(source.department),
    title: asString(source.title),
    company: asString(source.company),
    telephoneNumber: asString(source.telephoneNumber),
    description: asNullableString(source.description),
    enabled: asNullableBoolean(source.enabled),
    accountExpiresAt: asNullableString(source.accountExpiresAt),
    groupMemberships: Array.isArray(source.groupMemberships)
      ? source.groupMemberships.map((entry, index) =>
          asDirectoryGroupView(entry, `${label}.groupMemberships[${index}]`),
        )
      : [],
  };
}

function asDirectoryGroupMemberView(
  value: unknown,
  label: string,
): DirectoryGroupDetailView['members'][number] {
  const member = asDirectoryObjectRef(value, label);

  if (!member.distinguishedName) {
    throw new Error(`${label}.distinguishedName is required.`);
  }

  return {
    ...member,
    distinguishedName: member.distinguishedName,
    memberType:
      typeof (value as Record<string, unknown>)?.memberType === 'string'
        ? ((value as Record<string, unknown>).memberType as
            | 'user'
            | 'group'
            | 'unknown')
        : undefined,
  };
}

function asDirectoryGroupDetailView(
  value: unknown,
  label: string,
): DirectoryGroupDetailView {
  const group = asDirectoryGroupView(value, label);

  if (!isObject(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return {
    ...group,
    description: asNullableString(value.description),
    members: Array.isArray(value.members)
      ? value.members.map((entry, index) =>
          asDirectoryGroupMemberView(entry, `${label}.members[${index}]`),
        )
      : [],
  };
}

function asAccountChangeSnapshot(
  value: unknown,
  label: string,
): AccountChangeDirectorySnapshot {
  if (!isObject(value) || typeof value.loadedAt !== 'string') {
    throw new Error(`${label}.loadedAt is required.`);
  }

  return {
    loadedAt: value.loadedAt,
    account: asDirectoryAccountView(value.account, `${label}.account`),
  };
}

function asGroupChangeSnapshot(
  value: unknown,
  label: string,
): GroupChangeDirectorySnapshot {
  if (!isObject(value) || typeof value.loadedAt !== 'string') {
    throw new Error(`${label}.loadedAt is required.`);
  }

  return {
    loadedAt: value.loadedAt,
    group: asDirectoryGroupDetailView(value.group, `${label}.group`),
  };
}

function asAttributeChanges(
  value: unknown,
  label: string,
  options?: { allowEmpty?: boolean },
): AccountAttributeChange[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  if (!options?.allowEmpty && value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  return value.map((entry, index) => {
    if (!isObject(entry) || typeof entry.attribute !== 'string') {
      throw new Error(`changes[${index}] must include an attribute.`);
    }

    const previousValue =
      typeof entry.previousValue === 'string' || entry.previousValue === null
        ? entry.previousValue
        : undefined;
    const nextValue =
      typeof entry.nextValue === 'string' || entry.nextValue === null
        ? entry.nextValue
        : null;

    return {
      attribute: entry.attribute,
      previousValue,
      nextValue,
    };
  });
}

function asAccountGroupChanges(
  value: unknown,
  label: string,
): AccountGroupChange[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => {
    if (
      !isObject(entry) ||
      (entry.operation !== 'add' && entry.operation !== 'remove')
    ) {
      throw new Error(
        `${label}[${index}] must include operation add or remove.`,
      );
    }

    return {
      operation: entry.operation,
      group: (() => {
        const group = asDirectoryObjectRef(
          entry.group,
          `${label}[${index}].group`,
        );

        if (!hasDirectoryIdentity(group)) {
          throw new Error(
            `${label}[${index}].group requires a distinguishedName, samAccountName, objectGuid, or displayName.`,
          );
        }

        return group;
      })(),
    };
  });
}

function asGroupMemberChanges(
  value: unknown,
  label: string,
): GroupMemberChange[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  return value.map((entry, index) => {
    if (
      !isObject(entry) ||
      (entry.operation !== 'add' && entry.operation !== 'remove')
    ) {
      throw new Error(
        `${label}[${index}] must include operation add or remove.`,
      );
    }

    const member = asDirectoryObjectRef(
      entry.member,
      `${label}[${index}].member`,
    );

    if (!member.samAccountName) {
      throw new Error(`${label}[${index}].member.samAccountName is required.`);
    }

    return {
      operation: entry.operation,
      member: {
        ...member,
        samAccountName: member.samAccountName,
      },
    };
  });
}

export function parseChangeRequestPayload(
  payload: unknown,
): ChangeRequestPayload {
  if (!isObject(payload) || typeof payload.kind !== 'string') {
    throw new Error('payload.kind is required.');
  }

  switch (payload.kind) {
    case 'user_create': {
      const target = asDirectoryObjectRef(payload.target, 'user_create.target');

      if (
        !target.samAccountName ||
        !target.displayName ||
        typeof payload.target !== 'object' ||
        payload.target === null ||
        typeof (payload.target as Record<string, unknown>).givenName !==
          'string' ||
        typeof (payload.target as Record<string, unknown>).surname !== 'string'
      ) {
        throw new Error(
          'user_create.target requires samAccountName, displayName, givenName, and surname.',
        );
      }

      const source = payload.target as Record<string, unknown>;
      const parsed: UserCreatePayload = {
        kind: 'user_create',
        target: {
          ...target,
          samAccountName: target.samAccountName,
          displayName: target.displayName,
          givenName: source.givenName as string,
          surname: source.surname as string,
          userPrincipalName:
            typeof source.userPrincipalName === 'string'
              ? source.userPrincipalName
              : undefined,
          ouDistinguishedName:
            typeof source.ouDistinguishedName === 'string'
              ? source.ouDistinguishedName
              : undefined,
          mail: typeof source.mail === 'string' ? source.mail : undefined,
          password:
            typeof source.password === 'string' ? source.password : undefined,
          enabled:
            typeof source.enabled === 'boolean' ? source.enabled : undefined,
          accountExpiresAt:
            typeof source.accountExpiresAt === 'string' ||
            source.accountExpiresAt === null
              ? source.accountExpiresAt
              : undefined,
          description:
            typeof source.description === 'string' ||
            source.description === null
              ? source.description
              : undefined,
        },
        initialGroups: Array.isArray(payload.initialGroups)
          ? payload.initialGroups.map((entry) =>
              asDirectoryObjectRef(entry, 'initialGroups'),
            )
          : undefined,
      };

      return parsed;
    }

    case 'account_change': {
      const target = asDirectoryObjectRef(
        payload.target,
        'account_change.target',
      );

      if (!target.samAccountName) {
        throw new Error('account_change.target.samAccountName is required.');
      }

      const changes =
        payload.changes === undefined
          ? []
          : asAttributeChanges(payload.changes, 'account_change.changes', {
              allowEmpty: true,
            });
      const groupChanges =
        payload.groupChanges === undefined
          ? []
          : asAccountGroupChanges(
              payload.groupChanges,
              'account_change.groupChanges',
            );

      if (changes.length === 0 && groupChanges.length === 0) {
        throw new Error(
          'account_change requires at least one attribute or group change.',
        );
      }

      const parsed: AccountChangePayload = {
        kind: 'account_change',
        target: {
          ...target,
          samAccountName: target.samAccountName,
        },
        changes,
        groupChanges,
        snapshot:
          payload.snapshot === undefined
            ? undefined
            : asAccountChangeSnapshot(
                payload.snapshot,
                'account_change.snapshot',
              ),
      };

      return parsed;
    }

    case 'group_change': {
      const target = asDirectoryObjectRef(
        payload.target,
        'group_change.target',
      );

      if (!target.samAccountName) {
        throw new Error('group_change.target.samAccountName is required.');
      }

      const parsed: GroupChangePayload = {
        kind: 'group_change',
        target: {
          ...target,
          samAccountName: target.samAccountName,
        },
        memberChanges: asGroupMemberChanges(
          payload.memberChanges,
          'group_change.memberChanges',
        ),
        snapshot:
          payload.snapshot === undefined
            ? undefined
            : asGroupChangeSnapshot(payload.snapshot, 'group_change.snapshot'),
      };

      return parsed;
    }

    case 'account_update': {
      const target = asDirectoryObjectRef(
        payload.target,
        'account_update.target',
      );

      if (!target.samAccountName) {
        throw new Error('account_update.target.samAccountName is required.');
      }

      const parsed: AccountUpdatePayload = {
        kind: 'account_update',
        target: {
          ...target,
          samAccountName: target.samAccountName,
        },
        changes: asAttributeChanges(payload.changes, 'account_update.changes'),
      };

      return parsed;
    }

    case 'group_membership_add':
    case 'group_membership_remove': {
      const group = asDirectoryObjectRef(
        payload.group,
        `${payload.kind}.group`,
      );
      const member = asDirectoryObjectRef(
        payload.member,
        `${payload.kind}.member`,
      );

      if (!member.samAccountName) {
        throw new Error(`${payload.kind}.member.samAccountName is required.`);
      }

      if (!hasDirectoryIdentity(group)) {
        throw new Error(
          `${payload.kind}.group requires a distinguishedName, samAccountName, objectGuid, or displayName.`,
        );
      }

      const parsed: GroupMembershipPayload = {
        kind: payload.kind,
        group,
        member: {
          ...member,
          samAccountName: member.samAccountName,
        },
      };

      return parsed;
    }

    default:
      throw new Error(`Unsupported payload kind ${payload.kind}.`);
  }
}

export function getTargetColumns(payload: ChangeRequestPayload) {
  switch (payload.kind) {
    case 'user_create':
      return {
        target_object_type: 'user',
        target_object_guid: payload.target.objectGuid ?? null,
        target_object_sid: payload.target.objectSid ?? null,
        target_distinguished_name: payload.target.distinguishedName ?? null,
        target_sam_account_name: payload.target.samAccountName,
        target_display_name: payload.target.displayName,
      };
    case 'account_update':
    case 'account_change':
      return {
        target_object_type: 'user',
        target_object_guid: payload.target.objectGuid ?? null,
        target_object_sid: payload.target.objectSid ?? null,
        target_distinguished_name: payload.target.distinguishedName ?? null,
        target_sam_account_name: payload.target.samAccountName,
        target_display_name: payload.target.displayName ?? null,
      };
    case 'group_change':
      return {
        target_object_type: 'group',
        target_object_guid: payload.target.objectGuid ?? null,
        target_object_sid: payload.target.objectSid ?? null,
        target_distinguished_name: payload.target.distinguishedName ?? null,
        target_sam_account_name: payload.target.samAccountName,
        target_display_name: payload.target.displayName ?? null,
      };
    case 'group_membership_add':
    case 'group_membership_remove':
      return {
        target_object_type: 'group',
        target_object_guid: payload.group.objectGuid ?? null,
        target_object_sid: payload.group.objectSid ?? null,
        target_distinguished_name: payload.group.distinguishedName ?? null,
        target_sam_account_name: payload.group.samAccountName ?? null,
        target_display_name: payload.group.displayName ?? null,
      };
  }
}
