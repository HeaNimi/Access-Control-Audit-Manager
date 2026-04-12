import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CorrelationModule } from '../correlation/correlation.module';
import { ObservedEventsController } from './observed-events.controller';
import { ObservedEventsService } from './observed-events.service';

@Module({
  imports: [DatabaseModule, AuditModule, AuthModule, CorrelationModule],
  controllers: [ObservedEventsController],
  providers: [ObservedEventsService],
  exports: [ObservedEventsService],
})
export class ObservedEventsModule {}
