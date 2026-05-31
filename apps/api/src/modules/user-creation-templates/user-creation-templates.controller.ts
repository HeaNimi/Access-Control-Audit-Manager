import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { UserCreationTemplateInput } from '@acam-ts/contracts';

import { AuthGuard } from '../../common/auth/auth.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { Roles } from '../../common/auth/roles.decorator';
import { RolesGuard } from '../../common/auth/roles.guard';
import { UserCreationTemplatesService } from './user-creation-templates.service';

@Controller('user-creation-templates')
@UseGuards(AuthGuard, RolesGuard)
export class UserCreationTemplatesController {
  constructor(
    private readonly templatesService: UserCreationTemplatesService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.templatesService.list(
      user,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Post()
  @Roles('administrator')
  async create(
    @Body() body: UserCreationTemplateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templatesService.create(body, user);
  }

  @Patch(':templateId')
  @Roles('administrator')
  async update(
    @Param('templateId') templateId: string,
    @Body() body: Partial<UserCreationTemplateInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.templatesService.update(templateId, body, user);
  }
}
