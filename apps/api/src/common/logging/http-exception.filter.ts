import type { Request, Response } from 'express';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { AppLogService } from './app-log.service';

@Catch()
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  constructor(private readonly appLogService: AppLogService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request | undefined>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody = this.toResponseBody(exception, statusCode);

    if (statusCode >= 500) {
      this.appLogService.captureException('http-exception', exception, {
        method: request?.method,
        path: request?.originalUrl ?? request?.url,
        statusCode,
        actorUsername: request?.user?.username,
        actorRoles: request?.user?.roles ?? [],
        responseBody,
      });
    }

    response.status(statusCode).json(responseBody);
  }

  private toResponseBody(
    exception: unknown,
    statusCode: number,
  ): Record<string, unknown> {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return {
          statusCode,
          message: response,
          error: exception.name,
        };
      }

      if (response && typeof response === 'object' && !Array.isArray(response)) {
        return {
          statusCode,
          ...(response as Record<string, unknown>),
        };
      }
    }

    return {
      statusCode,
      message: 'Internal Server Error',
      error: 'Internal Server Error',
    };
  }
}
