import path from 'node:path';

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthMiddleware } from './common/auth/auth.middleware';
import { DatabaseModule } from './common/database/database.module';
import { LoggingModule } from './common/logging/logging.module';
import { RequestLoggingMiddleware } from './common/logging/request-logging.middleware';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CorrelationModule } from './modules/correlation/correlation.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { ObservedEventsModule } from './modules/observed-events/observed-events.module';
import { RequestsModule } from './modules/requests/requests.module';
import { SiemModule } from './modules/siem/siem.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env'),
      ],
    }),
    LoggingModule,
    DatabaseModule,
    AuthModule,
    AuditModule,
    DirectoryModule,
    CorrelationModule,
    RequestsModule,
    ObservedEventsModule,
    SiemModule,
    SettingsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware, AuthMiddleware).forRoutes('*');
  }
}
