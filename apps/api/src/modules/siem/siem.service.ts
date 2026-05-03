import { Injectable } from '@nestjs/common';

import type {
  RuntimeConfigSection,
  RuntimeHealthCheck,
} from '@acam-ts/contracts';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { AppLogService } from '../../common/logging/app-log.service';
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
  SiemNormalizationRejectCounts,
} from './siem.types';

@Injectable()
export class SiemService {
  constructor(
    private readonly auditService: AuditService,
    private readonly observedEventsService: ObservedEventsService,
    private readonly driverRegistry: SiemDriverRegistry,
    private readonly siemConfigService: SiemConfigService,
    private readonly checkpointRepository: SiemCheckpointRepository,
    private readonly appLogService: AppLogService,
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
      this.logPollWarning(source, 'SIEM polling is disabled.', {
        trigger: input.trigger,
      });

      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'skipped',
        fetchedCount: 0,
        storedCount: 0,
        warningCount: 1,
        warnings: ['SIEM polling is disabled.'],
      };
    }

    if (configuredIssue) {
      this.logPollWarning(source, configuredIssue, {
        trigger: input.trigger,
      });

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
      const warning = `Configured SIEM driver ${source.driverKey} is not registered.`;

      this.logPollWarning(source, warning, {
        trigger: input.trigger,
      });

      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'error',
        fetchedCount: 0,
        storedCount: 0,
        warningCount: 1,
        warnings: [warning],
        error: warning,
      };
    }

    const checkpoint = await this.checkpointRepository.getOrCreate(source);
    let cursor = this.checkpointRepository.toCursor(checkpoint, source);
    const warnings: string[] = [];
    const normalizationRejectCounts: SiemNormalizationRejectCounts = {};
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
        this.mergeRejectCounts(
          normalizationRejectCounts,
          batch.normalizationRejectCounts,
        );

        fetchedCount += batch.fetchedHitCount;

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

      if (
        warnings.length > 0 ||
        Object.keys(normalizationRejectCounts).length > 0
      ) {
        this.logPollWarning(source, 'SIEM poll completed with warnings.', {
          trigger: input.trigger,
          fetchedCount,
          storedCount,
          warnings,
          normalizationRejectCounts,
        });
      }

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
            normalizationRejectCounts,
          },
        });
      }

      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'success',
        fetchedCount,
        storedCount,
        warningCount: this.countWarnings(warnings, normalizationRejectCounts),
        warnings,
        normalizationRejectCounts:
          Object.keys(normalizationRejectCounts).length > 0
            ? normalizationRejectCounts
            : undefined,
        lastEventTime: cursor.lastEventTime ?? null,
        lastSourceReference: cursor.lastSourceReference ?? null,
      };
    } catch (error) {
      if (driver.disposeCursor) {
        await driver.disposeCursor(source, cursor).catch(() => undefined);
      }

      const errorMessage = toErrorMessage(error, 'SIEM poll failed.');

      await this.checkpointRepository.updateError(source, errorMessage, cursor);
      this.appLogService.captureException('siem', error, {
        trigger: input.trigger,
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        fetchedCount,
        storedCount,
        warnings,
        normalizationRejectCounts,
      });

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
          normalizationRejectCounts,
        },
      });

      return {
        sourceKey: source.sourceKey,
        driverKey: source.driverKey,
        status: 'error',
        fetchedCount,
        storedCount,
        warningCount: this.countWarnings(warnings, normalizationRejectCounts),
        warnings,
        normalizationRejectCounts:
          Object.keys(normalizationRejectCounts).length > 0
            ? normalizationRejectCounts
            : undefined,
        lastEventTime: cursor.lastEventTime ?? null,
        lastSourceReference: cursor.lastSourceReference ?? null,
        error: errorMessage,
      };
    }
  }

  private getBatchSize(): number {
    return this.siemConfigService.getBatchSize();
  }

  private logPollWarning(
    source: SiemSourceConfig,
    warning: string,
    meta: Record<string, unknown> = {},
  ): void {
    this.appLogService.warning('siem', warning, {
      sourceKey: source.sourceKey,
      driverKey: source.driverKey,
      ...meta,
    });
  }

  private mergeRejectCounts(
    target: SiemNormalizationRejectCounts,
    source?: SiemNormalizationRejectCounts,
  ): void {
    if (!source) {
      return;
    }

    for (const [reason, count] of Object.entries(source)) {
      if (!count) {
        continue;
      }

      const typedReason = reason as keyof SiemNormalizationRejectCounts;
      target[typedReason] = (target[typedReason] ?? 0) + count;
    }
  }

  private countWarnings(
    warnings: string[],
    normalizationRejectCounts: SiemNormalizationRejectCounts,
  ): number {
    return (
      warnings.length +
      Object.values(normalizationRejectCounts).filter((count) => (count ?? 0) > 0)
        .length
    );
  }
}
