import type { NextFunction, Request, Response } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';

import { AppLogService } from './app-log.service';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly appLogService: AppLogService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = Date.now();

    response.on('finish', () => {
      this.appLogService.info(
        'http',
        `${request.method} ${request.originalUrl}`,
        {
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
        },
      );
    });

    next();
  }
}
