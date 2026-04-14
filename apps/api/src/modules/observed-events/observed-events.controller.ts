import { timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  InternalServerErrorException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

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
  ) {
    const expectedKey =
      process.env.OBSERVED_EVENT_INGEST_KEY ?? 'change-me-ingest-key';

    if (!expectedKey || expectedKey === 'change-me-ingest-key') {
      throw new InternalServerErrorException(
        'Observed event ingest is not configured.',
      );
    }

    if (!this.matchesIngestKey(ingestKey, expectedKey)) {
      throw new ForbiddenException(
        'Provide a valid ingest key.',
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

  private matchesIngestKey(
    providedKey: string | undefined,
    expectedKey: string,
  ): boolean {
    if (!providedKey) {
      return false;
    }

    const provided = Buffer.from(providedKey, 'utf8');
    const expected = Buffer.from(expectedKey, 'utf8');

    if (provided.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(provided, expected);
  }
}
