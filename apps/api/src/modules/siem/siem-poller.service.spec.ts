import { SiemPollerService } from './siem-poller.service';
import { SiemService } from './siem.service';

describe('SiemPollerService', () => {
  it('reuses the in-flight poll when manual triggers overlap', async () => {
    let resolvePoll:
      | ((value: {
          trigger: 'manual';
          startedAt: string;
          finishedAt: string;
          sourceResults: [];
        }) => void)
      | undefined;
    const pollPromise = new Promise<{
      trigger: 'manual';
      startedAt: string;
      finishedAt: string;
      sourceResults: [];
    }>((resolve) => {
      resolvePoll = resolve;
    });
    const pollConfiguredSources = jest.fn().mockReturnValue(pollPromise);
    const siemService = {
      isSchedulerEnabled: jest.fn().mockReturnValue(false),
      getPollIntervalMs: jest.fn().mockReturnValue(30000),
      pollConfiguredSources,
    } as unknown as jest.Mocked<SiemService>;
    const pollerService = new SiemPollerService(siemService);

    const firstTrigger = pollerService.triggerPollNow(null);
    const secondTrigger = pollerService.triggerPollNow(null);

    expect(pollConfiguredSources).toHaveBeenCalledTimes(1);

    resolvePoll?.({
      trigger: 'manual',
      startedAt: '2026-04-10T10:00:00.000Z',
      finishedAt: '2026-04-10T10:00:01.000Z',
      sourceResults: [],
    });

    await expect(firstTrigger).resolves.toMatchObject({
      trigger: 'manual',
    });
    await expect(secondTrigger).resolves.toMatchObject({
      trigger: 'manual',
    });
  });
});
