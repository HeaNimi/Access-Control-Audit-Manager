import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { UserCreationTemplatesController } from './user-creation-templates.controller';
import { UserCreationTemplatesService } from './user-creation-templates.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [UserCreationTemplatesController],
  providers: [UserCreationTemplatesService],
  exports: [UserCreationTemplatesService],
})
export class UserCreationTemplatesModule {}
