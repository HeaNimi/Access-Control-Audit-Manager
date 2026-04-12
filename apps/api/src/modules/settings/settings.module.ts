import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { DirectoryModule } from '../directory/directory.module';
import { SiemModule } from '../siem/siem.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [DatabaseModule, AuthModule, DirectoryModule, SiemModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
