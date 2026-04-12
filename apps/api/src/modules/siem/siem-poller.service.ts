import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import type { SiemPollSummary } from './siem.types';
import { SiemService } from './siem.service';

@Injectable()
export class SiemPollerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SiemPollerService.name);

  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<SiemPollSummary> | null = null;

  constructor(private readonly siemService: SiemService) {}

  onApplicationBootstrap(): void {
    if (!this.siemService.isSchedulerEnabled()) {
      return;
    }

    this.scheduleNext(1000);
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  triggerPollNow(actor?: AuthenticatedUser | null): Promise<SiemPollSummary> {
    return this.runPoll('manual', actor ?? null, true);
  }

  private scheduleNext(delayMs: number): void {
    this.timer = setTimeout(() => {
      void this.runScheduledPoll();
    }, delayMs);
  }

  private async runScheduledPoll(): Promise<void> {
    try {
      await this.runPoll('interval', null, false);
    } finally {
      if (this.siemService.isSchedulerEnabled()) {
        this.scheduleNext(this.siemService.getPollIntervalMs());
      }
    }
  }

  private async runPoll(
    trigger: 'startup' | 'interval' | 'manual',
    actor: AuthenticatedUser | null,
    force: boolean,
  ): Promise<SiemPollSummary> {
    if (this.inFlight) {
      this.logger.debug(
        `Skipping ${trigger} SIEM poll because another poll is already running.`,
      );
      return this.inFlight;
    }

    this.inFlight = this.siemService
      .pollConfiguredSources({
        trigger,
        actor,
        force,
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}
