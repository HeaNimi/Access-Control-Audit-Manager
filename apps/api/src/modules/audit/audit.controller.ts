import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../../common/auth/auth.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { AuditService } from './audit.service';

@Controller('audit')
@UseGuards(AuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('auditor', 'administrator', 'approver')
  async list(
    @Query('requestId') requestId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = Number(page ?? '1');
    const parsedPageSize = Number(pageSize ?? '50');

    return this.auditService.list(
      Number.isFinite(parsedPage) ? parsedPage : 1,
      Number.isFinite(parsedPageSize) ? parsedPageSize : 50,
      requestId,
    );
  }

  @Get('object')
  @Roles('auditor', 'administrator', 'approver')
  async objectAudit(
    @Query('type') type?: 'user' | 'group',
    @Query('samAccountName') samAccountName?: string,
  ) {
    return this.auditService.getObjectAudit(
      type === 'group' ? 'group' : 'user',
      samAccountName ?? '',
    );
  }
}
