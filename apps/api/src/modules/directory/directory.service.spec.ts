import { DirectoryReaderService } from './directory-reader.service';
import { DirectorySessionService } from './directory-session.service';
import { DirectoryWriterService } from './directory-writer.service';

interface AccountViewLike {
  distinguishedName: string;
  samAccountName: string;
  groupMemberships: Array<{
    distinguishedName: string;
    samAccountName?: string;
  }>;
}

describe('Directory reader/writer internals', () => {
  const baseDn = 'DC=example,DC=local';

  function createSessionServiceMock() {
    return {
      createBoundClient: jest.fn(),
      createClient: jest.fn(),
      applyStartTlsIfConfigured: jest.fn(),
      withBoundClient: jest.fn(),
      getRequiredLdapConfig: jest.fn(),
      isPasswordWriteConnectionProtected: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<DirectorySessionService>;
  }

  it('waits for account mapping before unbinding the LDAP client', async () => {
    const sessionService = createSessionServiceMock();
    const service = new DirectoryReaderService(sessionService);
    const internals = service as unknown as {
      findUserEntryBySamAccountName: jest.Mock;
      mapAccountEntry: jest.MockedFunction<
        (
          client: unknown,
          entry: Record<string, unknown>,
          baseDn: string,
        ) => Promise<AccountViewLike>
      >;
    };
    const client = {
      unbind: jest.fn().mockResolvedValue(undefined),
    };
    const entry = {
      distinguishedName:
        'CN=Test User 1,OU=Users,OU=ManagedObjects,DC=example,DC=local',
      sAMAccountName: 'testuser1',
    };
    const mappedAccount: AccountViewLike = {
      distinguishedName: entry.distinguishedName,
      samAccountName: 'testuser1',
      groupMemberships: [],
    };

    sessionService.createBoundClient.mockResolvedValue({
      client,
      config: { baseDn } as never,
    });
    jest
      .spyOn(internals, 'findUserEntryBySamAccountName')
      .mockResolvedValue(entry);

    let resolveMapping: ((value: AccountViewLike) => void) | undefined;
    const mappingPromise = new Promise<AccountViewLike>((resolve) => {
      resolveMapping = resolve;
    });

    jest
      .spyOn(internals, 'mapAccountEntry')
      .mockImplementation(() => mappingPromise);

    const resultPromise = service.getAccountBySamAccountName('testuser1');

    await Promise.resolve();

    expect(client.unbind).not.toHaveBeenCalled();

    resolveMapping?.(mappedAccount);

    await expect(resultPromise).resolves.toEqual(mappedAccount);
    expect(client.unbind).toHaveBeenCalledTimes(1);
  });

  it('includes both direct and primary group memberships in the account view', async () => {
    const sessionService = createSessionServiceMock();
    const service = new DirectoryReaderService(sessionService);
    const helpdeskDn =
      'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local';
    const domainUsersDn = 'CN=Domain Users,CN=Users,DC=example,DC=local';
    const client = {
      search: jest.fn().mockImplementation((searchBase: string) => {
        if (searchBase === helpdeskDn) {
          return {
            searchEntries: [
              {
                distinguishedName: helpdeskDn,
                sAMAccountName: 'Helpdesk',
                cn: 'Helpdesk',
              },
            ],
          };
        }

        if (searchBase === baseDn) {
          return {
            searchEntries: [
              {
                distinguishedName: domainUsersDn,
                sAMAccountName: 'Domain Users',
                cn: 'Domain Users',
              },
            ],
          };
        }

        return { searchEntries: [] };
      }),
    };

    const account = await (
      service as unknown as {
        mapAccountEntry: (
          client: unknown,
          entry: Record<string, unknown>,
          baseDn: string,
        ) => Promise<AccountViewLike>;
      }
    ).mapAccountEntry(
      client,
      {
        distinguishedName:
          'CN=Test User 1,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        sAMAccountName: 'testuser1',
        objectSid: 'S-1-5-21-4013827353-799469157-2647928806-1106',
        primaryGroupID: '513',
        memberOf: helpdeskDn,
      },
      baseDn,
    );

    expect(account.groupMemberships).toEqual([
      expect.objectContaining({
        distinguishedName: domainUsersDn,
        samAccountName: 'Domain Users',
      }),
      expect.objectContaining({
        distinguishedName: helpdeskDn,
        samAccountName: 'Helpdesk',
      }),
    ]);
  });

  it('retries retryable LDAP socket failures once for write steps', async () => {
    const sessionService = createSessionServiceMock();
    const writerService = new DirectoryWriterService(
      sessionService,
      {} as DirectoryReaderService,
    );
    const retryableError = new Error(
      'Connection closed before message response was received. Message type: ModifyRequest (0x66)',
    );
    type BoundOperation = (client: unknown, config: unknown) => Promise<void>;
    const operation: BoundOperation = jest.fn().mockResolvedValue(undefined);
    let attempts = 0;
    const runLdapWriteStep = (
      writerService as unknown as {
        runLdapWriteStep: (
          stepName: string,
          operation: BoundOperation,
        ) => Promise<{ attempts: number }>;
      }
    ).runLdapWriteStep.bind(writerService);

    sessionService.withBoundClient.mockImplementation((fn: BoundOperation) => {
      attempts += 1;

      if (attempts === 1) {
        return Promise.reject(retryableError);
      }

      return fn({} as never, { baseDn } as never);
    });

    const result = await runLdapWriteStep('test-step', operation);

    expect(result.attempts).toBe(2);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
  });

  it('refuses passworded user creation before LDAP transport is protected', async () => {
    const sessionService = createSessionServiceMock();
    const writerService = new DirectoryWriterService(
      sessionService,
      {} as DirectoryReaderService,
    );

    sessionService.getRequiredLdapConfig.mockReturnValue({
      url: 'ldap://dc.example.local:389',
      bindDn: 'CN=Service Account,DC=example,DC=local',
      bindPassword: 'secret',
      baseDn,
      usersOuDn: 'OU=Users,DC=example,DC=local',
      upnSuffix: 'example.local',
      startTls: false,
      tlsRejectUnauthorized: true,
    });
    sessionService.isPasswordWriteConnectionProtected.mockReturnValue(false);

    const result = await writerService.execute({
      requestId: 'request-1',
      requestNumber: 1,
      requestType: 'user_create',
      payload: {
        kind: 'user_create',
        target: {
          samAccountName: 'test.user',
          displayName: 'Test User',
          givenName: 'Test',
          surname: 'User',
          password: 'Pronounceable-Password-123!',
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('protected LDAP connection');
    expect(result.raw?.partialChangesPossible).toBe(false);
    expect(sessionService.withBoundClient).not.toHaveBeenCalled();
  });
});
