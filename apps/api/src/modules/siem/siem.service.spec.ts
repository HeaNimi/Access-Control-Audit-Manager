import { ELASTIC_WINLOGBEAT_DRIVER_KEY } from './siem.constants';
import { SiemService } from './siem.service';
import type {
  SiemCursor,
  SiemDriver,
  SiemSourceConfig,
} from './siem.types';

describe('SiemService poll summaries', () => {
  function createSource(
    overrides: Partial<SiemSourceConfig> = {},
  ): SiemSourceConfig {
    return {
      sourceKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
      driverKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
      enabled: true,
      node: 'https://siem.example.local:9200',
      apiKey: 'test-key',
      index: 'winlogbeat-*',
      tlsRejectUnauthorized: false,
      eventIds: [4738],
      sourceSystem: 'elastic-winlogbeat',
      scopeBaseDn: 'OU=ManagedObjects,DC=example,DC=local',
      initialLookbackSeconds: 3600,
      pollOverlapSeconds: 120,
      healthLookbackSeconds: 86400,
      maxFutureSkewSeconds: 300,
      ...overrides,
    };
  }

  function createService(input: {
    source?: SiemSourceConfig;
    driver?: Partial<SiemDriver>;
  }) {
    const source = input.source ?? createSource();
    const cursor: SiemCursor = {
      lastEventTime: '2026-04-08T04:00:00.000Z',
      lastSourceReference: null,
      lastSort: null,
      runtimeState: null,
    };
    const auditService = {
      write: jest.fn().mockResolvedValue(1),
    };
    const observedEventsService = {
      ingest: jest.fn().mockResolvedValue(undefined),
    };
    const driverRegistry = {
      getDriver: jest.fn().mockReturnValue(input.driver),
    };
    const siemConfigService = {
      getSourceConfig: jest.fn().mockReturnValue(source),
      getSourceConfigurationIssue: jest.fn().mockReturnValue(null),
      getBatchSize: jest.fn().mockReturnValue(100),
      getPollIntervalMs: jest.fn().mockReturnValue(30000),
      getConfigSection: jest.fn(),
    };
    const checkpointRepository = {
      getOrCreate: jest.fn().mockResolvedValue({}),
      toCursor: jest.fn().mockReturnValue(cursor),
      updateSuccess: jest.fn().mockResolvedValue(undefined),
      updateError: jest.fn().mockResolvedValue(undefined),
    };
    const appLogService = {
      warning: jest.fn(),
      captureException: jest.fn(),
    };
    const service = new SiemService(
      auditService as never,
      observedEventsService as never,
      driverRegistry as never,
      siemConfigService as never,
      checkpointRepository as never,
      appLogService as never,
    );

    return {
      service,
      auditService,
      appLogService,
      checkpointRepository,
      observedEventsService,
    };
  }

  it('counts raw fetched hits and normalization rejects as poll warnings', async () => {
    const source = createSource();
    const driver: Partial<SiemDriver> = {
      key: source.driverKey,
      fetchBatch: jest.fn().mockResolvedValue({
        events: [],
        fetchedHitCount: 2,
        hasMore: false,
        nextCursor: {
          lastEventTime: '2026-04-08T04:00:00.000Z',
          lastSourceReference: null,
          lastSort: { values: [1775623872012, 1235] },
          runtimeState: null,
        },
        warnings: [
          'Fetched events but none could be normalized into observed events.',
        ],
        normalizationRejectCounts: {
          outside_scope: 2,
        },
      }),
      disposeCursor: jest.fn().mockResolvedValue(undefined),
    };
    const { service, auditService, appLogService } = createService({
      source,
      driver,
    });

    const summary = await service.pollConfiguredSources({
      trigger: 'manual',
      force: true,
      actor: null,
    });

    expect(summary.sourceResults[0]).toMatchObject({
      fetchedCount: 2,
      storedCount: 0,
      warningCount: 2,
      normalizationRejectCounts: {
        outside_scope: 2,
      },
    });
    expect(appLogService.warning).toHaveBeenCalledWith(
      'siem',
      'SIEM poll completed with warnings.',
      expect.objectContaining({
        fetchedCount: 2,
        storedCount: 0,
        normalizationRejectCounts: {
          outside_scope: 2,
        },
      }),
    );
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'siem_pull_completed',
        eventDetails: expect.objectContaining({
          fetchedCount: 2,
          storedCount: 0,
          normalizationRejectCounts: {
            outside_scope: 2,
          },
        }),
      }),
    );
  });

  it('reports disabled polling as one logged warning', async () => {
    const source = createSource({ enabled: false });
    const { service, appLogService } = createService({
      source,
      driver: undefined,
    });

    const summary = await service.pollConfiguredSources({
      trigger: 'manual',
      actor: null,
    });

    expect(summary.sourceResults[0]).toMatchObject({
      status: 'skipped',
      warningCount: 1,
      warnings: ['SIEM polling is disabled.'],
    });
    expect(appLogService.warning).toHaveBeenCalledWith(
      'siem',
      'SIEM polling is disabled.',
      expect.objectContaining({
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        trigger: 'manual',
      }),
    );
  });

  it('defensively infers fetched count for normalization warnings', async () => {
    const source = createSource();
    const driver: Partial<SiemDriver> = {
      key: source.driverKey,
      fetchBatch: jest.fn().mockResolvedValue({
        events: [],
        fetchedHitCount: 0,
        hasMore: false,
        nextCursor: {
          lastEventTime: '2026-04-08T04:00:00.000Z',
          lastSourceReference: null,
          lastSort: null,
          runtimeState: null,
        },
        warnings: [
          'Fetched events but none could be normalized into observed events.',
        ],
      }),
      disposeCursor: jest.fn().mockResolvedValue(undefined),
    };
    const { service, auditService, appLogService } = createService({
      source,
      driver,
    });

    const summary = await service.pollConfiguredSources({
      trigger: 'manual',
      force: true,
      actor: null,
    });

    expect(summary.sourceResults[0]).toMatchObject({
      fetchedCount: 1,
      storedCount: 0,
      warningCount: 1,
      warnings: [
        'Fetched events but none could be normalized into observed events.',
      ],
    });
    expect(appLogService.warning).toHaveBeenCalledWith(
      'siem',
      'SIEM poll completed with warnings.',
      expect.objectContaining({
        fetchedCount: 1,
        storedCount: 0,
        warnings: [
          'Fetched events but none could be normalized into observed events.',
        ],
      }),
    );
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventDetails: expect.objectContaining({
          fetchedCount: 1,
          storedCount: 0,
          warnings: [
            'Fetched events but none could be normalized into observed events.',
          ],
        }),
      }),
    );
  });

  it('does not move the checkpoint backwards for overlapped duplicate events', async () => {
    const source = createSource();
    const driver: Partial<SiemDriver> = {
      key: source.driverKey,
      fetchBatch: jest.fn().mockResolvedValue({
        events: [
          {
            observedEvent: {
              eventSource: 'active_directory',
              sourceSystem: 'elastic-winlogbeat',
              sourceReference:
                '.ds-winlogbeat-9.3.2-2026.04.06-000002:event-overlap',
              eventId: 4738,
              eventTime: '2026-04-08T03:59:30.000Z',
              eventType: 'account_update',
              title: 'User account changed',
              message: 'A user account was changed.',
              objectGuid: null,
              distinguishedName: null,
              samAccountName: 'helper.james',
              subjectAccountName: null,
              payload: {},
            },
            sort: { values: [1775617170000, 1] },
          },
        ],
        fetchedHitCount: 1,
        hasMore: false,
        nextCursor: {
          lastEventTime: '2026-04-08T04:00:00.000Z',
          lastSourceReference: null,
          lastSort: null,
          runtimeState: null,
        },
        warnings: [],
      }),
      disposeCursor: jest.fn().mockResolvedValue(undefined),
    };
    const { service, checkpointRepository } = createService({
      source,
      driver,
    });

    await service.pollConfiguredSources({
      trigger: 'manual',
      force: true,
      actor: null,
    });

    expect(checkpointRepository.updateSuccess).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        lastEventTime: '2026-04-08T04:00:00.000Z',
        lastSourceReference: null,
        lastSort: null,
      }),
    );
    expect(
      checkpointRepository.updateSuccess.mock.calls.some(
        ([, cursor]) => cursor.lastEventTime === '2026-04-08T03:59:30.000Z',
      ),
    ).toBe(false);
  });
});
