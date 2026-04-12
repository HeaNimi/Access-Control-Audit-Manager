import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { ApplicationLogEntryView } from '@acam-ts/contracts';

import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrator')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('runtime')
  getRuntime() {
    return this.settingsService.getRuntimeView();
  }

  @Get('logs')
  getLogs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('level') level?: string,
    @Query('source') source?: string,
  ) {
    const parsedPage = Number(page ?? '1');
    const parsedPageSize = Number(pageSize ?? '50');

    return this.settingsService.getLogs(
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedPageSize) ? parsedPageSize : 50,
      {
        level: this.parseLogLevel(level),
        source,
      },
    );
  }

  private parseLogLevel(
    value: string | undefined,
  ): ApplicationLogEntryView['level'] | undefined {
    if (
      value === 'log' ||
      value === 'warn' ||
      value === 'error' ||
      value === 'debug' ||
      value === 'verbose'
    ) {
      return value;
    }

    return undefined;
  }
}
