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
});
