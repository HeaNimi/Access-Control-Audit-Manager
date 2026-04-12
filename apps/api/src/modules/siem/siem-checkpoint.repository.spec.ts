import { SiemCheckpointRepository } from './siem-checkpoint.repository';
import { ELASTIC_WINLOGBEAT_DRIVER_KEY } from './siem.constants';
import type { SiemSourceConfig } from './siem.types';

describe('SiemCheckpointRepository', () => {
  const repository = Object.create(
    SiemCheckpointRepository.prototype,
  ) as SiemCheckpointRepository;
  const source: SiemSourceConfig = {
    sourceKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
    driverKey: ELASTIC_WINLOGBEAT_DRIVER_KEY,
    enabled: true,
    node: 'https://elastic.example.test:9200',
    apiKey: 'test-key',
    index: 'winlogbeat-*',
    tlsRejectUnauthorized: false,
    eventIds: [4720],
    sourceSystem: 'elastic-winlogbeat',
    initialLookbackSeconds: 3600,
    healthLookbackSeconds: 86400,
    maxFutureSkewSeconds: 300,
  };

  it('hydrates cursor state from stored checkpoint values', () => {
    const cursor = repository.toCursor(
      {
        source_key: source.sourceKey,
        driver_key: source.driverKey,
        enabled: true,
        last_event_time: new Date('2026-04-10T10:00:00.000Z'),
        last_sort: { values: ['2026-04-10T10:00:00.000Z', 123] },
        last_source_reference: 'winlogbeat:event-1',
        last_success_at: null,
        last_error_at: null,
        last_error_message: null,
        created_at: new Date('2026-04-10T10:00:00.000Z'),
        updated_at: new Date('2026-04-10T10:00:00.000Z'),
      },
      source,
    );

    expect(cursor).toEqual({
      lastEventTime: '2026-04-10T10:00:00.000Z',
      lastSort: { values: ['2026-04-10T10:00:00.000Z', 123] },
      lastSourceReference: 'winlogbeat:event-1',
      runtimeState: null,
    });
  });

  it('rewinds poisoned future checkpoints back to the initial lookback window', () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-04-12T00:30:00.000Z'));

    try {
      const cursor = repository.toCursor(
        {
          source_key: source.sourceKey,
          driver_key: source.driverKey,
          enabled: true,
          last_event_time: new Date('2026-04-12T08:31:21.529Z'),
          last_sort: { values: ['2026-04-12T08:31:21.529Z', 999] },
          last_source_reference: 'winlogbeat:future-event',
          last_success_at: new Date('2026-04-12T00:21:55.557Z'),
          last_error_at: null,
          last_error_message: null,
          created_at: new Date('2026-04-12T00:00:00.000Z'),
          updated_at: new Date('2026-04-12T00:21:55.557Z'),
        },
        source,
      );

      expect(cursor).toEqual({
        lastEventTime: '2026-04-11T23:30:00.000Z',
        lastSort: null,
        lastSourceReference: null,
        runtimeState: null,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
