import {
  getTargetColumns,
  parseChangeRequestPayload,
} from './requests.validation';

describe('requests.validation', () => {
  it('parses a user creation payload', () => {
    const payload = parseChangeRequestPayload({
      kind: 'user_create',
      target: {
        samAccountName: 'jdoe',
        displayName: 'John Doe',
        givenName: 'John',
        surname: 'Doe',
        ouDistinguishedName: 'OU=Users,OU=ManagedObjects,DC=example,DC=local',
      },
    });

    expect(payload.kind).toBe('user_create');
    if (payload.kind !== 'user_create') {
      throw new Error('Expected a user creation payload.');
    }

    expect(payload.target.samAccountName).toBe('jdoe');
    expect(getTargetColumns(payload).target_object_type).toBe('user');
  });

  it('parses a group membership payload and targets the group object', () => {
    const payload = parseChangeRequestPayload({
      kind: 'group_membership_add',
      group: {
        samAccountName: 'Finance-Readers',
        distinguishedName:
          'CN=Finance-Readers,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
      },
      member: {
        samAccountName: 'jdoe',
      },
    });

    expect(payload.kind).toBe('group_membership_add');
    if (payload.kind !== 'group_membership_add') {
      throw new Error('Expected a group membership payload.');
    }

    expect(payload.member.samAccountName).toBe('jdoe');
    expect(getTargetColumns(payload).target_sam_account_name).toBe(
      'Finance-Readers',
    );
  });

  it('parses a combined account change payload', () => {
    const payload = parseChangeRequestPayload({
      kind: 'account_change',
      target: {
        samAccountName: 'jdoe',
        displayName: 'John Doe',
      },
      snapshot: {
        loadedAt: '2026-04-05T20:00:00.000Z',
        account: {
          samAccountName: 'jdoe',
          distinguishedName:
            'CN=John Doe,OU=Users,OU=ManagedObjects,DC=example,DC=local',
          displayName: 'John Doe',
          groupMemberships: [
            {
              samAccountName: 'Finance-Readers',
              distinguishedName:
                'CN=Finance-Readers,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
            },
          ],
        },
      },
      changes: [
        {
          attribute: 'department',
          nextValue: 'Finance',
        },
      ],
      groupChanges: [
        {
          operation: 'add',
          group: {
            samAccountName: 'Finance-Readers',
          },
        },
        {
          operation: 'remove',
          group: {
            distinguishedName:
              'CN=Legacy-Access,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
          },
        },
      ],
    });

    expect(payload.kind).toBe('account_change');
    if (payload.kind !== 'account_change') {
      throw new Error('Expected an account change payload.');
    }

    expect(payload.changes).toHaveLength(1);
    expect(payload.groupChanges).toHaveLength(2);
    expect(payload.snapshot?.account.groupMemberships).toHaveLength(1);
    expect(getTargetColumns(payload).target_object_type).toBe('user');
  });

  it('parses a group change payload and targets the group object', () => {
    const payload = parseChangeRequestPayload({
      kind: 'group_change',
      target: {
        samAccountName: 'Developers',
        displayName: 'Developers',
        distinguishedName:
          'CN=Developers,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
      },
      snapshot: {
        loadedAt: '2026-04-07T20:00:00.000Z',
        group: {
          samAccountName: 'Developers',
          displayName: 'Developers',
          distinguishedName:
            'CN=Developers,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
          members: [
            {
              samAccountName: 'testuser1',
              distinguishedName:
                'CN=Test User 1,OU=Users,OU=ManagedObjects,DC=example,DC=local',
              memberType: 'user',
            },
          ],
        },
      },
      memberChanges: [
        {
          operation: 'add',
          member: {
            samAccountName: 'testuser2',
            distinguishedName:
              'CN=Test User 2,OU=Users,OU=ManagedObjects,DC=example,DC=local',
          },
        },
      ],
    });

    expect(payload.kind).toBe('group_change');
    if (payload.kind !== 'group_change') {
      throw new Error('Expected a group change payload.');
    }

    expect(payload.memberChanges).toHaveLength(1);
    expect(payload.snapshot?.group.members).toHaveLength(1);
    expect(getTargetColumns(payload).target_object_type).toBe('group');
    expect(getTargetColumns(payload).target_sam_account_name).toBe(
      'Developers',
    );
  });

  it('rejects group change payloads without member changes', () => {
    expect(() =>
      parseChangeRequestPayload({
        kind: 'group_change',
        target: {
          samAccountName: 'Developers',
        },
        memberChanges: [],
      }),
    ).toThrow('group_change.memberChanges must be a non-empty array.');
  });

  it('rejects payloads without the required discriminator', () => {
    expect(() => parseChangeRequestPayload({ target: {} })).toThrow(
      'payload.kind is required.',
    );
  });
});
