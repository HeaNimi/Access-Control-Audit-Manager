import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  RuntimeConfigEntry,
  RuntimeConfigSection,
} from '@acam-ts/contracts';

import { readNumberConfigValue } from '../../common/utils/config.utils';
import { ELASTIC_WINLOGBEAT_DRIVER_KEY } from './siem.constants';
import type { SiemSourceConfig } from './siem.types';
import {
  readSiemEnabled,
  readSiemEventIds,
  readScopeBaseDn,
  readTlsRejectUnauthorized,
} from './siem.utils';

@Injectable()
export class SiemConfigService {
  constructor(private readonly configService: ConfigService) {}

  getSourceConfig(): SiemSourceConfig {
    const enabled = readSiemEnabled(
      this.configService.get<string>('SIEM_PULL_ENABLED'),
    );
    const initialLookbackSeconds = readNumberConfigValue(
      this.configService.get<string>('SIEM_INITIAL_LOOKBACK_SECONDS'),
      3600,
    );
    const maxFutureSkewSeconds = readNumberConfigValue(
      this.configService.get<string>('SIEM_MAX_FUTURE_SKEW_SECONDS'),
      300,
    );

    return {
      sourceKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
      driverKey:
        this.configService.get<string>('SIEM_DRIVER')?.trim() ??
        ELASTIC_WINLOGBEAT_DRIVER_KEY,
      enabled,
      node: this.configService.get<string>('ELASTICSEARCH_NODE')?.trim() ?? '',
      apiKey: this.configService.get<string>('ELASTICSEARCH_API_KEY')?.trim(),
      index:
        this.configService.get<string>('ELASTICSEARCH_INDEX')?.trim() ??
        'winlogbeat-*',
      tlsRejectUnauthorized: readTlsRejectUnauthorized(
        this.configService.get<string>('ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED'),
      ),
      eventIds: readSiemEventIds(
        this.configService.get<string>('ELASTICSEARCH_EVENT_IDS'),
      ),
      sourceSystem:
        this.configService.get<string>('ELASTICSEARCH_SOURCE_SYSTEM')?.trim() ??
        ELASTIC_WINLOGBEAT_DRIVER_KEY,
      scopeBaseDn: readScopeBaseDn(
        this.configService.get<string>('ELASTICSEARCH_SCOPE_BASE_DN'),
      ),
      initialLookbackSeconds,
      healthLookbackSeconds: Math.max(initialLookbackSeconds, 86400),
      maxFutureSkewSeconds,
    };
  }

  getPollIntervalMs(): number {
    return (
      readNumberConfigValue(
        this.configService.get<string>('SIEM_POLL_INTERVAL_SECONDS'),
        30,
      ) * 1000
    );
  }

  getBatchSize(): number {
    return readNumberConfigValue(
      this.configService.get<string>('SIEM_BATCH_SIZE'),
      100,
    );
  }

  getConfigSection(): RuntimeConfigSection {
    const source = this.getSourceConfig();

    return {
      key: 'siem',
      label: 'SIEM',
      entries: [
        this.entry('SIEM_PULL_ENABLED', source.enabled ? 'true' : 'false'),
        this.entry('SIEM_DRIVER', source.driverKey),
        this.entry(
          'SIEM_POLL_INTERVAL_SECONDS',
          String(this.getPollIntervalMs() / 1000),
        ),
        this.entry('SIEM_BATCH_SIZE', String(this.getBatchSize())),
        this.entry(
          'SIEM_INITIAL_LOOKBACK_SECONDS',
          String(source.initialLookbackSeconds),
        ),
        this.entry(
          'SIEM_MAX_FUTURE_SKEW_SECONDS',
          String(source.maxFutureSkewSeconds),
        ),
        this.entry('ELASTICSEARCH_NODE', source.node || 'Not set'),
        this.entry('ELASTICSEARCH_INDEX', source.index),
        this.entry(
          'ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED',
          source.tlsRejectUnauthorized ? 'true' : 'false',
        ),
        this.entry('ELASTICSEARCH_SOURCE_SYSTEM', source.sourceSystem),
        this.entry('ELASTICSEARCH_EVENT_IDS', source.eventIds.join(', ')),
        this.entry(
          'ELASTICSEARCH_SCOPE_BASE_DN',
          source.scopeBaseDn ?? 'Not set',
        ),
        this.secretEntry('ELASTICSEARCH_API_KEY'),
      ],
    };
  }

  getSourceConfigurationIssue(source: SiemSourceConfig): string | null {
    if (!source.node) {
      return 'ELASTICSEARCH_NODE is not configured.';
    }

    if (!source.apiKey) {
      return 'ELASTICSEARCH_API_KEY is not configured.';
    }

    return null;
  }

  private entry(key: string, value: string): RuntimeConfigEntry {
    return { key, value };
  }

  private secretEntry(key: string): RuntimeConfigEntry {
    const value = this.configService.get<string>(key);

    return {
      key,
      value: value ? '[redacted]' : 'Not set',
      redacted: !!value,
    };
  }
}
