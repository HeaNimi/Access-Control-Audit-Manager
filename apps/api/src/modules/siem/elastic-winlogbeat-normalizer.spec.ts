import { normalizeElasticWinlogbeatHit } from './elastic-winlogbeat-normalizer';
import { ELASTIC_WINLOGBEAT_DRIVER_KEY } from './siem.constants';
import type { SiemFetchedEvent, SiemSourceConfig } from './siem.types';

describe('elastic-winlogbeat-normalizer', () => {
  const source: SiemSourceConfig = {
    sourceKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
    driverKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
    enabled: true,
    node: 'https://elastic.example.test:9200',
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
    pollOverlapSeconds: 120,
    healthLookbackSeconds: 86400,
    maxFutureSkewSeconds: 300,
  };

  it('normalizes ECS v8 user creation hits', async () => {
    const normalized = await normalizeElasticWinlogbeatHit({
      source,
      cursor: {
        lastEventTime: '2026-04-08T04:00:00.000Z',
        lastSourceReference: null,
        lastSort: null,
        runtimeState: null,
      },
      resolveSamAccountNameFromDistinguishedName: jest.fn(),
      resolveAccountDistinguishedNameBySamAccountName: jest
        .fn()
        .mockResolvedValue(
          'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        ),
      resolveGroupDistinguishedNameBySamAccountName: jest.fn(),
      hit: {
        _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
        _id: 'event-1',
        _source: {
          '@timestamp': '2026-04-08T04:51:12.002Z',
          ecs: { version: '8.0.0' },
          event: { code: '4720' },
          message: 'A user account was created.',
          winlog: {
            channel: 'Security',
            event_id: '4720',
            provider_name: 'Microsoft-Windows-Security-Auditing',
            event_data: {
              SamAccountName: 'helper.james',
              TargetUserName: 'helper.james',
            },
          },
        },
        sort: [1775623872002, 1234],
      },
    });

    expect(expectNormalized(normalized).observedEvent).toMatchObject({
      sourceSystem: 'elastic-winlogbeat',
      sourceReference: '.ds-winlogbeat-9.3.2-2026.04.06-000002:event-1',
      eventId: 4720,
      eventType: 'user_create',
      samAccountName: 'helper.james',
      subjectAccountName: null,
      title: 'User account created',
    });
    expect(expectNormalized(normalized).sort).toEqual({
      values: [1775623872002, 1234],
    });
  });

  it('uses directory resolution for membership member DNs with CN fallback', async () => {
    const resolveSamAccountNameFromDistinguishedName = jest
      .fn()
      .mockResolvedValue(null);
    const normalized = await normalizeElasticWinlogbeatHit({
      source,
      cursor: {
        lastEventTime: '2026-04-08T04:00:00.000Z',
        lastSourceReference: null,
        lastSort: null,
        runtimeState: null,
      },
      resolveSamAccountNameFromDistinguishedName,
      resolveAccountDistinguishedNameBySamAccountName: jest.fn(),
      resolveGroupDistinguishedNameBySamAccountName: jest.fn(),
      hit: {
        _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
        _id: 'event-2',
        _source: {
          '@timestamp': '2026-04-08T04:51:12.012Z',
          ecs: { version: '8.0.0' },
          event: { code: '4728' },
          winlog: {
            channel: 'Security',
            event_id: '4728',
            event_data: {
              TargetUserName: 'Helpdesk',
              MemberName:
                'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
            },
          },
        },
      },
    });

    expect(resolveSamAccountNameFromDistinguishedName).toHaveBeenCalledWith(
      'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
    );
    expect(expectNormalized(normalized).observedEvent).toMatchObject({
      eventId: 4728,
      eventType: 'group_membership_add',
      samAccountName: 'Helpdesk',
      subjectAccountName: 'helper james',
    });
  });

  it('drops events outside the configured ManagedObjects scope', async () => {
    const normalized = await normalizeElasticWinlogbeatHit({
      source,
      cursor: {
        lastEventTime: '2026-04-08T04:00:00.000Z',
        lastSourceReference: null,
        lastSort: null,
        runtimeState: null,
      },
      resolveSamAccountNameFromDistinguishedName: jest.fn(),
      resolveAccountDistinguishedNameBySamAccountName: jest.fn(),
      resolveGroupDistinguishedNameBySamAccountName: jest.fn(),
      hit: {
        _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
        _id: 'event-3',
        _source: {
          '@timestamp': '2026-04-08T04:51:12.100Z',
          ecs: { version: '8.0.0' },
          event: { code: '5136' },
          message: 'A directory service object was modified.',
          winlog: {
            channel: 'Security',
            event_id: '5136',
            event_data: {
              ObjectDN:
                'CN={6AC1786C-016F-11D2-945F-00C04FB984F9},CN=POLICIES,CN=SYSTEM,DC=NOTBAD,DC=INTRA',
            },
          },
        },
      },
    });

    expect(normalized).toEqual({
      status: 'rejected',
      reason: 'outside_scope',
    });
  });

  it('normalizes account disable hits as account events', async () => {
    const normalized = await normalizeElasticWinlogbeatHit({
      source,
      cursor: {
        lastEventTime: '2026-04-08T04:00:00.000Z',
        lastSourceReference: null,
        lastSort: null,
        runtimeState: null,
      },
      resolveSamAccountNameFromDistinguishedName: jest.fn(),
      resolveAccountDistinguishedNameBySamAccountName: jest
        .fn()
        .mockResolvedValue(
          'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        ),
      resolveGroupDistinguishedNameBySamAccountName: jest.fn(),
      hit: {
        _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
        _id: 'event-4',
        _source: {
          '@timestamp': '2026-04-08T05:01:12.002Z',
          ecs: { version: '8.0.0' },
          event: { code: '4725' },
          message: 'A user account was disabled.',
          winlog: {
            channel: 'Security',
            event_id: '4725',
            provider_name: 'Microsoft-Windows-Security-Auditing',
            event_data: {
              SamAccountName: 'helper.james',
              TargetUserName: 'helper.james',
              ObjectDN:
                'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
            },
          },
        },
        sort: [1775624472002, 1236],
      },
    });

    expect(expectNormalized(normalized).observedEvent).toMatchObject({
      eventId: 4725,
      eventType: 'account_disable',
      samAccountName: 'helper.james',
      title: 'User account disabled',
    });
  });

  it('rejects hits missing source or timestamp', async () => {
    const normalized = await normalizeElasticWinlogbeatHit({
      source,
      cursor: {
        lastEventTime: null,
        lastSourceReference: null,
        lastSort: null,
        runtimeState: null,
      },
      resolveSamAccountNameFromDistinguishedName: jest.fn(),
      resolveAccountDistinguishedNameBySamAccountName: jest.fn(),
      resolveGroupDistinguishedNameBySamAccountName: jest.fn(),
      hit: {
        _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
        _id: 'event-missing-source',
      },
    });

    expect(normalized).toEqual({
      status: 'rejected',
      reason: 'missing_source_or_timestamp',
    });
  });

  it('rejects the cursor boundary duplicate', async () => {
    const normalized = await normalizeElasticWinlogbeatHit({
      source,
      cursor: {
        lastEventTime: '2026-04-08T04:51:12.002Z',
        lastSourceReference:
          '.ds-winlogbeat-9.3.2-2026.04.06-000002:event-duplicate',
        lastSort: null,
        runtimeState: null,
      },
      resolveSamAccountNameFromDistinguishedName: jest.fn(),
      resolveAccountDistinguishedNameBySamAccountName: jest.fn(),
      resolveGroupDistinguishedNameBySamAccountName: jest.fn(),
      hit: {
        _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
        _id: 'event-duplicate',
        _source: {
          '@timestamp': '2026-04-08T04:51:12.002Z',
          event: { code: '4720' },
          winlog: {
            channel: 'Security',
            event_id: '4720',
            event_data: {
              TargetUserName: 'helper.james',
            },
          },
        },
      },
    });

    expect(normalized).toEqual({
      status: 'rejected',
      reason: 'cursor_duplicate',
    });
  });

  it('rejects unsupported event IDs', async () => {
    const normalized = await normalizeElasticWinlogbeatHit({
      source,
      cursor: {
        lastEventTime: null,
        lastSourceReference: null,
        lastSort: null,
        runtimeState: null,
      },
      resolveSamAccountNameFromDistinguishedName: jest.fn(),
      resolveAccountDistinguishedNameBySamAccountName: jest.fn(),
      resolveGroupDistinguishedNameBySamAccountName: jest.fn(),
      hit: {
        _index: '.ds-winlogbeat-9.3.2-2026.04.06-000002',
        _id: 'event-unsupported',
        _source: {
          '@timestamp': '2026-04-08T04:51:12.002Z',
          event: { code: '4624' },
          winlog: {
            channel: 'Security',
            event_id: '4624',
            event_data: {},
          },
        },
      },
    });

    expect(normalized).toEqual({
      status: 'rejected',
      reason: 'unsupported_event_id',
    });
  });
});

function expectNormalized(
  result: Awaited<ReturnType<typeof normalizeElasticWinlogbeatHit>>,
): SiemFetchedEvent {
  expect(result.status).toBe('normalized');

  if (result.status !== 'normalized') {
    throw new Error(`Expected normalized event, got ${result.reason}.`);
  }

  return result.event;
}
