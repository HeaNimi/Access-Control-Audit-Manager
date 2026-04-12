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
  appLogService.info('bootstrap', 'ACAM API started', { port });
  process.stdout.write(`ACAM API listening on http://localhost:${port}\n`);
}

void bootstrap();
