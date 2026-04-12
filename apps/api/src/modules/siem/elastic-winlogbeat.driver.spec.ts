import type { DirectoryAccountView } from '@acam-ts/contracts';

import { DirectoryService } from '../directory/directory.service';
import { ElasticWinlogbeatDriver } from './elastic-winlogbeat.driver';
import { ELASTIC_WINLOGBEAT_DRIVER_KEY } from './siem.constants';
import type { SiemSourceConfig } from './siem.types';

describe('ElasticWinlogbeatDriver', () => {
  function createSourceConfig(): SiemSourceConfig {
    return {
      sourceKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
      driverKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
      enabled: true,
      node: 'https://siem.example.local:9200',
      apiKey: 'test-key',
      index: 'winlogbeat-*',
      tlsRejectUnauthorized: false,
      eventIds: [
        4720, 4722, 4723, 4724, 4725, 4726, 4728, 4729, 4732, 4733, 4738, 4740,
        4756, 4757, 4767, 4781, 5136, 5137,
      ],
      sourceSystem: 'elastic-winlogbeat',
      scopeBaseDn: 'OU=ManagedObjects,DC=example,DC=local',
      initialLookbackSeconds: 3600,
      healthLookbackSeconds: 86400,
      maxFutureSkewSeconds: 300,
    };
  }

  function createDirectoryServiceMock() {
    return {
      getAccountByDistinguishedName: jest.fn(),
      getAccountBySamAccountName: jest.fn().mockResolvedValue({
        distinguishedName:
          'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        samAccountName: 'helper.james',
        groupMemberships: [],
      } satisfies Partial<DirectoryAccountView>),
      getGroupBySamAccountName: jest.fn(),
    } as unknown as jest.Mocked<DirectoryService>;
  }

  it('normalizes a 4720 user creation event into the observed-event shape', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-04-08T05:00:00.000Z'));
    const directoryService = createDirectoryServiceMock();
    const driver = new ElasticWinlogbeatDriver(directoryService);
    const client = {
      openPointInTime: jest.fn().mockResolvedValue({ id: 'pit-1' }),
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
              _id: 'event-1',
              _source: {
                '@timestamp': '2026-04-08T04:51:12.002Z',
                ecs: { version: '8.0.0' },
                event: { code: '4720', action: 'Special Logon' },
                message: 'A user account was created.',
                winlog: {
                  channel: 'Security',
                  event_id: '4720',
                  provider_name: 'Microsoft-Windows-Security-Auditing',
                  event_data: {
                    SamAccountName: 'helper.james',
                    TargetUserName: 'helper.james',
                    DisplayName: 'helper james',
                    UserPrincipalName: 'helper.james@example.local',
                  },
                },
              },
              sort: [1775623872002, 1234],
            },
          ],
        },
      }),
      closePointInTime: jest.fn().mockResolvedValue({ succeeded: true }),
    };

    try {
      jest
        .spyOn(
          driver as unknown as { createClient: () => typeof client },
          'createClient',
        )
        .mockReturnValue(client);

      const result = await driver.fetchBatch(
        createSourceConfig(),
        {
          lastEventTime: '2026-04-08T04:00:00.000Z',
          lastSort: null,
          lastSourceReference: null,
          runtimeState: null,
        },
        50,
      );

      expect(result.events).toHaveLength(1);
      expect(result.events[0].observedEvent).toMatchObject({
        eventSource: 'active_directory',
        sourceSystem: 'elastic-winlogbeat',
        sourceReference: '.ds-winlogbeat-9.3.2-2026.04.06-000002:event-1',
        eventId: 4720,
        eventType: 'user_create',
        samAccountName: 'helper.james',
        subjectAccountName: null,
        title: 'User account created',
      });
      expect(result.hasMore).toBe(false);
      expect(client.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                expect.objectContaining({
                  range: {
                    '@timestamp': expect.objectContaining({
                      gte: '2026-04-08T04:00:00.000Z',
                      lte: '2026-04-08T05:05:00.000Z',
                    }),
                  },
                }),
              ]),
            }),
          }),
        }),
      );
      expect(client.closePointInTime).toHaveBeenCalledWith({ id: 'pit-1' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves member distinguished names into subjectAccountName for membership events', async () => {
    const getAccountByDistinguishedName = jest.fn();
    const getGroupBySamAccountName = jest.fn().mockResolvedValue({
      distinguishedName: 'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
    });
    const directoryService = {
      getAccountByDistinguishedName,
      getGroupBySamAccountName,
      getAccountBySamAccountName: jest.fn(),
    } as unknown as jest.Mocked<DirectoryService>;
    const driver = new ElasticWinlogbeatDriver(directoryService);
    const client = {
      openPointInTime: jest.fn().mockResolvedValue({ id: 'pit-1' }),
      search: jest.fn().mockResolvedValue({
        hits: {
          hits: [
            {
              _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
              _id: 'event-2',
              _source: {
                '@timestamp': '2026-04-08T04:51:12.012Z',
                ecs: { version: '8.0.0' },
                event: { code: '4728', action: 'Special Logon' },
                message:
                  'A member was added to a security-enabled global group.',
                winlog: {
                  channel: 'Security',
                  event_id: '4728',
                  provider_name: 'Microsoft-Windows-Security-Auditing',
                  event_data: {
                    TargetUserName: 'Helpdesk',
                    MemberName:
                      'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
                    MemberSid: 'S-1-5-21-4013827353-799469157-2647928806-1126',
                  },
                },
              },
              sort: [1775623872012, 1235],
            },
          ],
        },
      }),
      closePointInTime: jest.fn().mockResolvedValue({ succeeded: true }),
    };
    const memberAccount: DirectoryAccountView = {
      distinguishedName:
        'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
      samAccountName: 'helper.james',
      groupMemberships: [],
    };

    getAccountByDistinguishedName.mockResolvedValue(memberAccount);
    jest
      .spyOn(
        driver as unknown as { createClient: () => typeof client },
        'createClient',
      )
      .mockReturnValue(client);

    const result = await driver.fetchBatch(
      createSourceConfig(),
      {
        lastEventTime: '2026-04-08T04:00:00.000Z',
        lastSort: null,
        lastSourceReference: null,
        runtimeState: null,
      },
      50,
    );

    expect(getAccountByDistinguishedName).toHaveBeenCalledWith(
      'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
    );
    expect(result.events[0].observedEvent).toMatchObject({
      eventId: 4728,
      eventType: 'group_membership_add',
      samAccountName: 'Helpdesk',
      subjectAccountName: 'helper.james',
      title: 'User added to group',
    });
  });
});
