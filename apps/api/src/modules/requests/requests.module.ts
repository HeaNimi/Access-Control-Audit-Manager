import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { ReadModelModule } from '../../common/read-model/read-model.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CorrelationModule } from '../correlation/correlation.module';
import { DirectoryModule } from '../directory/directory.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [
    DatabaseModule,
    ReadModelModule,
    AuthModule,
    AuditModule,
    DirectoryModule,
    CorrelationModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
