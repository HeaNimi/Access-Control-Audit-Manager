import { ConfigService } from '@nestjs/config';

import { SiemConfigService } from './siem-config.service';

describe('SiemConfigService', () => {
  function createService(values: Record<string, string | undefined> = {}) {
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new SiemConfigService(configService);
  }

  it('defaults SIEM poll overlap to 120 seconds', () => {
    const service = createService();

    expect(service.getSourceConfig().pollOverlapSeconds).toBe(120);
    expect(service.getSourceConfig().maxFutureSkewSeconds).toBe(120);
  });

  it('uses explicit SIEM poll overlap for past overlap and future skew', () => {
    const service = createService({
      SIEM_POLL_OVERLAP_SECONDS: '240',
    });

    expect(service.getSourceConfig().pollOverlapSeconds).toBe(240);
    expect(service.getSourceConfig().maxFutureSkewSeconds).toBe(240);
    expect(service.getConfigSection().entries).toContainEqual({
      key: 'SIEM_POLL_OVERLAP_SECONDS',
      value: '240',
    });
  });
});
