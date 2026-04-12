import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type {
  ApplicationLogEntryView,
  ApplicationLogsView,
  RuntimeConfigSection,
  RuntimeHealthCheck,
  SettingsRuntimeView,
} from '@acam-ts/contracts';
import type { DatabaseSchema } from '../../common/database/schema';

import { DATABASE_TOKEN } from '../../common/database/database.constants';
import { AppLogService } from '../../common/logging/app-log.service';
import { AuthService } from '../auth/auth.service';
import { DirectoryService } from '../directory/directory.service';
import { SiemService } from '../siem/siem.service';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
    private readonly configService: ConfigService,
    private readonly appLogService: AppLogService,
    private readonly authService: AuthService,
    private readonly directoryService: DirectoryService,
    private readonly siemService: SiemService,
  ) {}

  async getRuntimeView(): Promise<SettingsRuntimeView> {
    const health = await this.getHealthChecks();

    return {
      environment: this.configService.get<string>('NODE_ENV') ?? 'development',
      appVersion: process.env.npm_package_version ?? '0.0.0',
      startedAt: this.appLogService.startedAt.toISOString(),
      uptimeSeconds: Math.floor(
        (Date.now() - this.appLogService.startedAt.getTime()) / 1000,
      ),
      health,
      configSections: this.getConfigSections(),
    };
  }

  getLogs(
    page: number,
    pageSize: number,
    filters: {
      level?: ApplicationLogEntryView['level'];
      source?: string;
    } = {},
  ): ApplicationLogsView {
    return this.appLogService.paginate(page, pageSize, filters);
  }

  private async getHealthChecks(): Promise<RuntimeHealthCheck[]> {
    const checks: RuntimeHealthCheck[] = [];

    try {
      await sql`select 1`.execute(this.db);
      checks.push({
        key: 'database',
        label: 'PostgreSQL',
        status: 'healthy',
        detail: 'Database connection is healthy.',
      });
    } catch (error) {
      checks.push({
        key: 'database',
        label: 'PostgreSQL',
        status: 'error',
        detail:
          error instanceof Error
            ? error.message
            : 'Database connection failed.',
      });
    }

    checks.push(await this.directoryService.getConnectionHealth());
    checks.push(...this.authService.getAuthenticationHealthChecks());
    checks.push(...(await this.siemService.getHealthChecks()));

    checks.push({
      key: 'logging',
      label: 'Application logs',
      status: 'healthy',
      detail: `Writing structured logs to ${this.appLogService.getLogPath()}.`,
    });

    return checks;
  }

  private getConfigSections(): RuntimeConfigSection[] {
    return [
      {
        key: 'authentication',
        label: 'Authentication',
        entries: [
          this.entry(
            'AUTH_ENABLE_LDAP_LOGIN',
            this.authService.isLdapLoginEnabled() ? 'true' : 'false',
          ),
          this.entry(
            'AUTH_ENABLE_LOCAL_ADMIN_LOGIN',
            this.authService.isLocalAdminLoginEnabled() ? 'true' : 'false',
          ),
          this.secretEntry('AUTH_JWT_SECRET'),
          this.entry('AUTH_JWT_TTL_SECONDS', '28800'),
          this.entry(
            'AUTH_LOCAL_ADMIN_USERNAME',
            this.authService.getLocalAdminUsername() ?? 'Not set',
          ),
          this.secretEntry('AUTH_LOCAL_ADMIN_PASSWORD'),
        ],
      },
      {
        key: 'role-mapping',
        label: 'Role mapping',
        entries: [
          this.presenceEntry(
            'AUTH_ROLE_MAP_APPROVER_GROUP_DNS',
            this.authService.getConfiguredRoleMappingCounts().approver,
          ),
          this.presenceEntry(
            'AUTH_ROLE_MAP_AUDITOR_GROUP_DNS',
            this.authService.getConfiguredRoleMappingCounts().auditor,
          ),
          this.presenceEntry(
            'AUTH_ROLE_MAP_ADMINISTRATOR_GROUP_DNS',
            this.authService.getConfiguredRoleMappingCounts().administrator,
          ),
        ],
      },
      {
        key: 'application',
        label: 'Application',
        entries: [
          this.entry('NODE_ENV'),
          this.entry('APP_API_PORT', '3001'),
          this.entry('NUXT_PUBLIC_API_BASE_URL'),
          this.entry('APP_LOG_PATH', this.appLogService.getLogPath()),
        ],
      },
      {
        key: 'database',
        label: 'Database',
        entries: [
          this.entry('POSTGRES_HOST'),
          this.entry('POSTGRES_PORT', '5432'),
          this.entry('POSTGRES_DB'),
          this.entry('POSTGRES_USER'),
          this.secretEntry('POSTGRES_PASSWORD'),
          this.secretEntry('DATABASE_URL'),
        ],
      },
      {
        key: 'directory',
        label: 'Directory',
        entries: [
          this.entry('DIRECTORY_EXECUTION_SERVICE_ACCOUNT'),
          this.entry('LDAP_URL'),
          this.entry('LDAP_BIND_DN'),
          this.secretEntry('LDAP_BIND_PASSWORD'),
          this.entry('LDAP_START_TLS', 'false'),
          this.entry('LDAP_TLS_REJECT_UNAUTHORIZED', 'true'),
          this.entry('LDAP_BASE_DN'),
          this.entry('LDAP_USERS_OU_DN'),
          this.entry('LDAP_UPN_SUFFIX'),
        ],
      },
      {
        key: 'correlation',
        label: 'Correlation',
        entries: [this.entry('CORRELATION_WINDOW_SECONDS', '60')],
      },
      this.siemService.getConfigSection(),
      {
        key: 'observed-events',
        label: 'Observed Events',
        entries: [this.secretEntry('OBSERVED_EVENT_INGEST_KEY')],
      },
    ];
  }

  private entry(key: string, fallback = 'Not set') {
    return {
      key,
      value: this.configService.get<string>(key) ?? fallback,
    };
  }

  private secretEntry(key: string) {
    const value = this.configService.get<string>(key);

    return {
      key,
      value: value ? '[redacted]' : 'Not set',
      redacted: !!value,
    };
  }

  private presenceEntry(key: string, configuredCount: number) {
    return {
      key,
      value:
        configuredCount > 0
          ? `Configured (${configuredCount} group${configuredCount === 1 ? '' : 's'})`
          : 'Not set',
    };
  }
}
