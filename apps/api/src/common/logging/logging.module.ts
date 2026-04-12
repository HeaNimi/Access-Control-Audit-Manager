import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AppLogService } from './app-log.service';
import { HttpExceptionLoggingFilter } from './http-exception.filter';

@Global()
@Module({
  providers: [
    AppLogService,
    HttpExceptionLoggingFilter,
    {
      provide: APP_FILTER,
      useExisting: HttpExceptionLoggingFilter,
    },
  ],
  exports: [AppLogService],
})
export class LoggingModule {}
