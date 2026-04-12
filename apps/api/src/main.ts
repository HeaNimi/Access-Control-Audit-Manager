import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AppLogService } from './common/logging/app-log.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const appLogService = app.get(AppLogService);

  app.useLogger(appLogService);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const port = Number(process.env.APP_API_PORT ?? process.env.PORT ?? 3001);

  await app.listen(port);
  appLogService.info('bootstrap', 'ACAM API started', {
    port,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    ldapUrlConfigured: !!process.env.LDAP_URL,
    ldapBindDnConfigured: !!process.env.LDAP_BIND_DN,
    ldapBindPasswordConfigured: !!process.env.LDAP_BIND_PASSWORD,
    ldapBaseDnConfigured: !!process.env.LDAP_BASE_DN,
    databaseUrlConfigured:
      !!process.env.DATABASE_URL ||
      !!(
        process.env.POSTGRES_HOST &&
        process.env.POSTGRES_DB &&
        process.env.POSTGRES_USER
      ),
  });
  process.stdout.write(`ACAM API listening on http://localhost:${port}\n`);
}

void bootstrap();
