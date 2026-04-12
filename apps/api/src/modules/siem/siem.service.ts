import { Injectable } from '@nestjs/common';

import type {
  RuntimeConfigSection,
  RuntimeHealthCheck,
} from '@acam-ts/contracts';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { toErrorMessage } from '../../common/utils/error.utils';
import { AuditService } from '../audit/audit.service';
import { ObservedEventsService } from '../observed-events/observed-events.service';
import { SiemCheckpointRepository } from './siem-checkpoint.repository';
import { SiemConfigService } from './siem-config.service';
import { SiemDriverRegistry } from './siem-driver-registry.service';
import type {
  SiemPollSummary,
  SiemSourceConfig,
  SiemSourcePollResult,
} from './siem.types';

@Injectable()
export class SiemService {
  constructor(
    private readonly auditService: AuditService,
    private readonly observedEventsService: ObservedEventsService,
    private readonly driverRegistry: SiemDriverRegistry,
    private readonly siemConfigService: SiemConfigService,
    private readonly checkpointRepository: SiemCheckpointRepository,
  ) {}

  isSchedulerEnabled(): boolean {
    return this.siemConfigService.getSourceConfig().enabled;
  }

  getPollIntervalMs(): number {
    return this.siemConfigService.getPollIntervalMs();
  }

  getConfigSection(): RuntimeConfigSection {
    return this.siemConfigService.getConfigSection();
  }

  async getHealthChecks(): Promise<RuntimeHealthCheck[]> {
    const source = this.siemConfigService.getSourceConfig();
    const configuredIssue =
      this.siemConfigService.getSourceConfigurationIssue(source);
    const checkpoint = await this.checkpointRepository.getOrCreate(source);
    const checkpointDetail = this.checkpointRepository.describe(checkpoint);

    if (!source.enabled) {
      return [
        {
          key: 'siem',
          label: 'SIEM / Elasticsearch',
          status: 'warning',
          detail: `SIEM polling is disabled.${checkpointDetail}`,
        },
      ];
    }

    if (configuredIssue) {
      return [
        {
          key: 'siem',
          label: 'SIEM / Elasticsearch',
          status: 'warning',
          detail: `${configuredIssue}${checkpointDetail}`,
        },
      ];
    }
    const driver = this.driverRegistry.getDriver(source.driverKey);

    if (!driver) {
      return [
        {
          key: 'siem',
          label: 'SIEM / Elasticsearch',
          status: 'error',
          detail: `Configured SIEM driver ${source.driverKey} is not registered.${checkpointDetail}`,
        },
      ];
    }

    const driverHealth = await driver.getHealth(source);

    return [
      {
        ...driverHealth,
        detail: `${driverHealth.detail}${checkpointDetail}`,
      },
    ];
  }

  async pollConfiguredSources(input: {
    trigger: 'startup' | 'interval' | 'manual';
    actor?: AuthenticatedUser | null;
    force?: boolean;
  }): Promise<SiemPollSummary> {
    const startedAt = new Date();
    const source = this.siemConfigService.getSourceConfig();
    const sourceResult = await this.pollSource(source, input);

    return {
      trigger: input.trigger,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      sourceResults: [sourceResult],
    };
  }

  private async pollSource(
    source: SiemSourceConfig,
    input: {
      trigger: 'startup' | 'interval' | 'manual';
      actor?: AuthenticatedUser | null;
      force?: boolean;
    },
  ): Promise<SiemSourcePollResult> {
    const configuredIssue =
      this.siemConfigService.getSourceConfigurationIssue(source);

    if (!input.force && !source.enabled) {
      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'skipped',
        fetchedCount: 0,
        storedCount: 0,
        warningCount: 0,
        warnings: ['SIEM polling is disabled.'],
      };
    }

    if (configuredIssue) {
      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'error',
        fetchedCount: 0,
        storedCount: 0,
        warningCount: 1,
        warnings: [configuredIssue],
        error: configuredIssue,
      };
    }

    const driver = this.driverRegistry.getDriver(source.driverKey);

    if (!driver) {
      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'error',
        fetchedCount: 0,
        storedCount: 0,
        warningCount: 1,
        warnings: [
          `Configured SIEM driver ${source.driverKey} is not registered.`,
        ],
        error: `Configured SIEM driver ${source.driverKey} is not registered.`,
      };
    }

    const checkpoint = await this.checkpointRepository.getOrCreate(source);
    let cursor = this.checkpointRepository.toCursor(checkpoint, source);
    const warnings: string[] = [];
    let fetchedCount = 0;
    let storedCount = 0;

    try {
      while (true) {
        const batch = await driver.fetchBatch(
          source,
          cursor,
          this.getBatchSize(),
        );
        cursor = batch.nextCursor;
        warnings.push(...batch.warnings);
        fetchedCount += batch.events.length;

        for (const event of batch.events) {
          await this.observedEventsService.ingest(event.observedEvent);
          storedCount += 1;

          cursor = {
            ...cursor,
            lastEventTime: event.observedEvent.eventTime,
            lastSourceReference: event.observedEvent.sourceReference ?? null,
            lastSort: event.sort,
          };

          await this.checkpointRepository.updateSuccess(source, cursor);
        }

        if (!batch.hasMore) {
          break;
        }
      }

      if (driver.disposeCursor) {
        await driver.disposeCursor(source, cursor);
      }

      await this.checkpointRepository.updateSuccess(source, cursor);

      if (input.trigger === 'manual') {
        await this.auditService.write({
          requestId: null,
          actor: input.actor ?? null,
          actorRole: input.actor?.roles[0] ?? 'system',
          eventType: 'siem_pull_completed',
          entityType: 'siem_source',
          entityId: source.sourceKey,
          message: `Manual SIEM pull completed for ${source.sourceKey}.`,
          eventDetails: {
            trigger: input.trigger,
            sourceKey: source.sourceKey,
            driverKey: source.driverKey,
            fetchedCount,
            storedCount,
            warnings,
          },
        });
      }

      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'success',
        fetchedCount,
        storedCount,
        warningCount: warnings.length,
        warnings,
        lastEventTime: cursor.lastEventTime ?? null,
        lastSourceReference: cursor.lastSourceReference ?? null,
      };
    } catch (error) {
      if (driver.disposeCursor) {
        await driver.disposeCursor(source, cursor).catch(() => undefined);
      }

      const errorMessage = toErrorMessage(error, 'SIEM poll failed.');

      await this.checkpointRepository.updateError(source, errorMessage, cursor);
      await this.auditService.write({
        requestId: null,
        actor: input.actor ?? null,
        actorRole: input.actor?.roles[0] ?? 'system',
        eventType: 'siem_pull_failed',
        entityType: 'siem_source',
        entityId: source.sourceKey,
        message: `SIEM pull failed for ${source.sourceKey}.`,
        eventDetails: {
          trigger: input.trigger,
          sourceKey: source.sourceKey,
          driverKey: source.driverKey,
          error: errorMessage,
        },
      });

      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'error',
        fetchedCount,
        storedCount,
        warningCount: warnings.length,
        warnings,
        lastEventTime: cursor.lastEventTime ?? null,
        lastSourceReference: cursor.lastSourceReference ?? null,
        error: errorMessage,
      };
    }
  }

  private getBatchSize(): number {
    return this.siemConfigService.getBatchSize();
  }
}
