import { Controller, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { SiemPollerService } from './siem-poller.service';

@Controller('siem')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrator')
export class SiemController {
  constructor(private readonly siemPollerService: SiemPollerService) {}

  @Post('poll-now')
  pollNow(@CurrentUser() user: AuthenticatedUser) {
    return this.siemPollerService.triggerPollNow(user);
  }
}
