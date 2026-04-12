import {
  buildDirectorySignalKey,
  getDirectoryRefIdentifier,
  matchesDirectoryRef,
  valueMatches,
} from './directory-ref.utils';

describe('directory-ref.utils', () => {
  it('matches values case-insensitively', () => {
    expect(valueMatches('TESTUSER1', 'testuser1')).toBe(true);
    expect(valueMatches('testuser1', 'testuser2')).toBe(false);
  });

  it('matches directory refs by GUID, DN, samAccountName, or displayName', () => {
    expect(
      matchesDirectoryRef(
        { objectGuid: 'guid-1' },
        { objectGuid: 'guid-1', samAccountName: 'other' },
      ),
    ).toBe(true);
    expect(
      matchesDirectoryRef(
        {
          distinguishedName:
            'CN=Test User 1,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        },
        {
          distinguishedName:
      'cn=test user 1,ou=users,ou=managedobjects,dc=example,dc=local',
        },
      ),
    ).toBe(true);
    expect(
      matchesDirectoryRef(
        { samAccountName: 'testuser1' },
        { samAccountName: 'TESTUSER1' },
      ),
    ).toBe(true);
    expect(
      matchesDirectoryRef(
        { displayName: 'Test User 1' },
        { displayName: 'test user 1' },
      ),
    ).toBe(true);
  });

  it('builds normalized directory signal keys', () => {
    expect(
      getDirectoryRefIdentifier(
        {
          distinguishedName:
            'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
        },
        'group',
      ),
    ).toBe('cn=helpdesk,ou=groups,ou=managedobjects,dc=example,dc=local');
    expect(
      buildDirectorySignalKey('add', { samAccountName: 'Helpdesk' }, 'group'),
    ).toBe('add:helpdesk');
  });
});
