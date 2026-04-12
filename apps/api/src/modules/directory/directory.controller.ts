import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../../common/auth/auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { DirectoryService } from './directory.service';

@Controller('directory')
@UseGuards(AuthGuard, RolesGuard)
export class DirectoryController {
  constructor(private readonly directoryService: DirectoryService) {}

  @Get('users/search')
  async searchUsers(@Query('query') query?: string) {
    return this.directoryService.searchUsers(query ?? '');
  }

  @Get('users/:samAccountName')
  async getUser(@Param('samAccountName') samAccountName: string) {
    return this.directoryService.getAccountBySamAccountName(samAccountName);
  }

  @Get('groups/search')
  async searchGroups(@Query('query') query?: string) {
    return this.directoryService.searchGroups(query ?? '');
  }

  @Get('groups/:samAccountName')
  async getGroup(@Param('samAccountName') samAccountName: string) {
    return this.directoryService.getGroupBySamAccountName(samAccountName);
  }
}
