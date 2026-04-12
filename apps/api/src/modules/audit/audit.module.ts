import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { ReadModelModule } from '../../common/read-model/read-model.module';
import { AuthModule } from '../auth/auth.module';
import { DirectoryModule } from '../directory/directory.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [DatabaseModule, ReadModelModule, AuthModule, DirectoryModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
