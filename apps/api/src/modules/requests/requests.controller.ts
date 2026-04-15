import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ApprovalDecisionDto } from './dto/approval-decision.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
@UseGuards(AuthGuard, RolesGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.requestsService.list(user);
  }

  @Post()
  async create(
    @Body() dto: CreateChangeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.create(dto, user);
  }

  @Get(':requestId')
  async getDetail(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.getDetail(requestId, user);
  }

  @Post(':requestId/decision')
  @Roles('approver', 'administrator')
  async decide(
    @Param('requestId') requestId: string,
    @Body() dto: ApprovalDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.decide(requestId, dto, user);
  }

  @Post(':requestId/retry-execution')
  @Roles('administrator')
  async retryExecution(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.retryExecution(requestId, user);
  }

  @Get(':requestId/timeline')
  async timeline(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requestsService.getTimeline(requestId, user);
  }
}
