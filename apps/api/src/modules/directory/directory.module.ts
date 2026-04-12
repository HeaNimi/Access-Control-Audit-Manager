import { Module } from '@nestjs/common';

import { DirectoryController } from './directory.controller';
import { DirectoryReaderService } from './directory-reader.service';
import { DirectorySessionService } from './directory-session.service';
import { DirectoryService } from './directory.service';
import { DirectoryWriterService } from './directory-writer.service';

@Module({
  controllers: [DirectoryController],
  providers: [
    DirectorySessionService,
    DirectoryReaderService,
    DirectoryWriterService,
    DirectoryService,
  ],
  exports: [DirectoryService],
})
export class DirectoryModule {}
