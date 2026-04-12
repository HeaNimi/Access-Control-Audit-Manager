import { Injectable } from '@nestjs/common';

import { ElasticWinlogbeatDriver } from './elastic-winlogbeat.driver';
import type { SiemDriver } from './siem.types';

@Injectable()
export class SiemDriverRegistry {
  private readonly drivers = new Map<string, SiemDriver>();

  constructor(elasticWinlogbeatDriver: ElasticWinlogbeatDriver) {
    this.drivers.set(elasticWinlogbeatDriver.key, elasticWinlogbeatDriver);
  }

  getDriver(driverKey: string): SiemDriver | undefined {
    return this.drivers.get(driverKey);
  }
}
