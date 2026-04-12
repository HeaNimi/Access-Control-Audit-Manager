import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CorrelationService } from './correlation.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [CorrelationService],
  exports: [CorrelationService],
})
export class CorrelationModule {}
