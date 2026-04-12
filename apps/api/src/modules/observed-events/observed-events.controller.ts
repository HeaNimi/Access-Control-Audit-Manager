import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { ObservedEventIngestDto } from './dto/observed-event-ingest.dto';
import { ObservedEventsService } from './observed-events.service';

@Controller('observed-events')
export class ObservedEventsController {
  constructor(private readonly observedEventsService: ObservedEventsService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('auditor', 'administrator', 'approver')
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('scope') scope?: 'all' | 'unmatched',
  ) {
    const parsedPage = Number(page ?? '1');
    const parsedPageSize = Number(pageSize ?? '50');

    return this.observedEventsService.list(
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedPageSize) ? parsedPageSize : 50,
      {
        unmatchedOnly: scope === 'unmatched',
      },
    );
  }

  @Post('ingest')
  async ingest(
    @Body() dto: ObservedEventIngestDto,
    @Headers('x-ingest-key') ingestKey: string | undefined,
    @Req() request: Request,
  ) {
    const expectedKey =
      process.env.OBSERVED_EVENT_INGEST_KEY ?? 'change-me-ingest-key';
    const isPrivilegedUser = request.user?.roles.some((role) =>
      ['administrator', 'auditor', 'approver'].includes(role),
    );

    if (ingestKey !== expectedKey && !isPrivilegedUser) {
      throw new ForbiddenException(
        'Provide a valid ingest key or sign in with a privileged role.',
      );
    }

    return this.observedEventsService.ingest(dto);
  }

  @Get('unmatched')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('auditor', 'administrator', 'approver')
  async listUnmatched(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = Number(page ?? '1');
    const parsedPageSize = Number(pageSize ?? '50');

    return this.observedEventsService.listUnmatched(
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedPageSize) ? parsedPageSize : 50,
    );
  }
}
