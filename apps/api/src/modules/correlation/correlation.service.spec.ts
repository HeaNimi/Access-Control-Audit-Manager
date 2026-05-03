import type { AuditLogRow } from '../../common/database/schema';
import { CorrelationService } from './correlation.service';

describe('CorrelationService execution attempt reconstruction', () => {
  function createService(): CorrelationService {
    return new CorrelationService({} as never, {} as never, {
      info: jest.fn(),
      warning: jest.fn(),
      captureException: jest.fn(),
    } as never);
  }

  function auditRow(
    eventType: 'execution_started' | 'execution_finished' | 'execution_failed',
    createdAt: string,
    eventDetails: Record<string, unknown> = {},
  ): AuditLogRow {
    return {
      audit_log_id: 1,
      request_id: 'request-1',
      actor_user_id: null,
      actor_username: null,
      actor_role: 'system',
      event_type: eventType,
      entity_type: 'request_execution',
      entity_id: 'request-1',
      message: null,
      event_details: eventDetails,
      created_at: new Date(createdAt),
    };
  }

  it('prefers explicit execution timestamps from audit details', () => {
    const service = createService() as unknown as {
      buildAttemptsFromAuditRows: (rows: AuditLogRow[]) => Array<{
        startedAt: Date;
        finishedAt: Date | null;
        executionResult?: Record<string, unknown>;
      }>;
    };

    const attempts = service.buildAttemptsFromAuditRows([
      auditRow('execution_started', '2026-04-15T09:10:00.100Z', {
        startedAt: '2026-04-15T09:10:00.000Z',
      }),
      auditRow('execution_finished', '2026-04-15T09:10:02.000Z', {
        startedAt: '2026-04-15T09:10:00.000Z',
        finishedAt: '2026-04-15T09:10:01.250Z',
        raw: { mode: 'ldap' },
      }),
    ]);

    expect(attempts).toHaveLength(1);
    expect(attempts[0].startedAt.toISOString()).toBe(
      '2026-04-15T09:10:00.000Z',
    );
    expect(attempts[0].finishedAt?.toISOString()).toBe(
      '2026-04-15T09:10:01.250Z',
    );
    expect(attempts[0].executionResult).toEqual({ mode: 'ldap' });
  });

  it('falls back to audit row creation timestamps for old rows', () => {
    const service = createService() as unknown as {
      buildAttemptsFromAuditRows: (rows: AuditLogRow[]) => Array<{
        startedAt: Date;
        finishedAt: Date | null;
        executionResult?: Record<string, unknown>;
      }>;
    };

    const attempts = service.buildAttemptsFromAuditRows([
      auditRow('execution_started', '2026-04-15T09:10:00.100Z'),
      auditRow('execution_failed', '2026-04-15T09:10:02.000Z', {
        raw: { ldapErrorMessage: 'failure' },
      }),
    ]);

    expect(attempts).toHaveLength(1);
    expect(attempts[0].startedAt.toISOString()).toBe(
      '2026-04-15T09:10:00.100Z',
    );
    expect(attempts[0].finishedAt?.toISOString()).toBe(
      '2026-04-15T09:10:02.000Z',
    );
    expect(attempts[0].executionResult).toEqual({
      ldapErrorMessage: 'failure',
    });
  });
});
