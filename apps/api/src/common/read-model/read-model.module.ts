import { Module } from '@nestjs/common';

import { ReadModelService } from './read-model.service';

@Module({
  providers: [ReadModelService],
  exports: [ReadModelService],
})
export class ReadModelModule {}
