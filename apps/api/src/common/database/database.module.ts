import type { Kysely } from 'kysely';
import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { readBooleanFlag } from '../utils/config.utils';
import { AppLogService } from '../logging/app-log.service';
import { createKyselyDb } from './client';
import { DATABASE_TOKEN } from './database.constants';
import { runMigrations } from './migrate';
import type { DatabaseSchema } from './schema';

type AppDatabase = Kysely<DatabaseSchema>;

class DatabaseShutdownService implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}

@Module({
  providers: [
    {
      provide: DATABASE_TOKEN,
      inject: [ConfigService, AppLogService],
      useFactory: async (
        configService: ConfigService,
        appLogService: AppLogService,
      ): Promise<AppDatabase> => {
        const connectionString =
          configService.get<string>('DATABASE_URL') ??
          'postgres://acam:acam@localhost:5432/acam_ts';
        const shouldRunMigrations = readBooleanFlag(
          configService.get<string>('DATABASE_AUTO_MIGRATE'),
          true,
        );

        if (shouldRunMigrations) {
          const result = await runMigrations({
            connectionString,
            log: (message) => appLogService.info('database', message),
          });

          if (result.applied.length === 0) {
            appLogService.info('database', 'Database schema is up to date');
          }
        } else {
          appLogService.info(
            'database',
            'Skipping automatic database migrations',
          );
        }

        return createKyselyDb(connectionString);
      },
    },
    DatabaseShutdownService,
  ],
  exports: [DATABASE_TOKEN],
})
export class DatabaseModule {}
