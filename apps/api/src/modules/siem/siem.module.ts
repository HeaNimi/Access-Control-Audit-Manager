import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { DirectoryModule } from '../directory/directory.module';
import { ObservedEventsModule } from '../observed-events/observed-events.module';
import { ElasticWinlogbeatDriver } from './elastic-winlogbeat.driver';
import { SiemCheckpointRepository } from './siem-checkpoint.repository';
import { SiemConfigService } from './siem-config.service';
import { SiemController } from './siem.controller';
import { SiemDriverRegistry } from './siem-driver-registry.service';
import { SiemPollerService } from './siem-poller.service';
import { SiemService } from './siem.service';

@Module({
  imports: [DatabaseModule, AuditModule, DirectoryModule, ObservedEventsModule],
  controllers: [SiemController],
  providers: [
    ElasticWinlogbeatDriver,
    SiemCheckpointRepository,
    SiemConfigService,
    SiemDriverRegistry,
    SiemService,
    SiemPollerService,
  ],
  exports: [SiemService, SiemPollerService],
})
export class SiemModule {}
