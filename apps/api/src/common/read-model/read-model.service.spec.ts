import type { ChangeRequestPayload } from '@acam-ts/contracts';

import { ReadModelService } from './read-model.service';

describe('ReadModelService', () => {
  const service = new ReadModelService();

  it('builds a request summary with the expected shape', () => {
    const payload: ChangeRequestPayload = {
      kind: 'account_change',
      target: {
        samAccountName: 'testuser1',
        displayName: 'Test User 1',
      },
      changes: [
        {
          attribute: 'department',
          nextValue: 'Finance',
        },
      ],
      groupChanges: [],
    };

    const summary = service.buildChangeRequestSummary({
      request: {
        request_id: 'request-1',
        request_number: 1,
        request_type: 'account_change',
        status: 'submitted',
        title: 'Update department',
        justification: 'Business change',
        submitted_at: new Date('2026-04-09T09:00:00.000Z'),
        approved_at: null,
        executed_at: null,
      },
      payload,
      requesterDisplayName: 'Mait N',
      approverDisplayName: 'Test Approver',
      correlationState: 'pending',
    });

    expect(summary).toEqual({
      requestId: 'request-1',
      requestNumber: 1,
      requestType: 'account_change',
      status: 'submitted',
      title: 'Update department',
      justification: 'Business change',
      requesterDisplayName: 'Mait N',
      approverDisplayName: 'Test Approver',
      targetSummary:
        'Test User 1 (testuser1) · 1 attribute change(s), 0 group change(s)',
      correlationState: 'pending',
      submittedAt: '2026-04-09T09:00:00.000Z',
      approvedAt: null,
      executedAt: null,
    });
  });

  it('builds a combined request timeline in chronological order', () => {
    const timeline = service.buildRequestTimeline({
      request: {
        requestId: 'request-1',
        requestNumber: 1,
        title: 'Update department',
        requesterDisplayName: 'Mait N',
        status: 'executed',
        submittedAt: '2026-04-09T09:00:00.000Z',
      },
      approvals: [
        {
          approvalId: 'approval-1',
          approverUserId: 'user-2',
          approverDisplayName: 'Approver',
          approverUsername: 'approver1',
          decision: 'approved',
          decisionComment: 'Looks good',
          decidedAt: '2026-04-09T09:05:00.000Z',
          createdAt: '2026-04-09T09:01:00.000Z',
        },
      ],
      execution: {
        executionId: 'execution-1',
        executionStatus: 'executed',
        startedAt: '2026-04-09T09:06:00.000Z',
        finishedAt: '2026-04-09T09:07:00.000Z',
        errorMessage: null,
        executionResult: {},
      },
      auditTrail: [
        {
          auditLogId: 1,
          eventType: 'request_submitted',
          actorDisplayName: 'Mait N',
          actorUsername: 'maitn',
          actorRole: 'requester',
          entityType: 'change_request',
          entityId: 'request-1',
          message: 'Submitted',
          eventDetails: {},
          createdAt: '2026-04-09T09:00:30.000Z',
        },
      ],
      observedEvents: [
        {
          observedEventId: 10,
          eventSource: 'windows-security-log',
          sourceSystem: 'wazuh',
          eventTime: '2026-04-09T09:08:00.000Z',
          payload: {},
          createdAt: '2026-04-09T09:08:10.000Z',
          correlationState: 'matched',
          matchedRequest: null,
        },
      ],
      correlations: [
        {
          correlationId: 20,
          correlatedAt: '2026-04-09T09:09:00.000Z',
          note: 'Matched by workflow',
        },
      ],
    });

    expect(timeline.map((item) => item.kind)).toEqual([
      'request_submitted',
      'audit_log',
      'approval_decided',
      'execution_started',
      'execution_finished',
      'observed_event',
      'correlation',
    ]);
  });

  it('maps audit and observed event rows without changing fields', () => {
    expect(
      service.mapAuditRow({
        audit_log_id: 1,
        event_type: 'request_submitted',
        actor_display_name: 'Mait N',
        actor_username: 'maitn',
        actor_role: 'requester',
        entity_type: 'change_request',
        entity_id: 'request-1',
        message: 'Submitted',
        event_details: { requestNumber: 1 },
        created_at: new Date('2026-04-09T09:00:00.000Z'),
      }),
    ).toEqual({
      auditLogId: 1,
      eventType: 'request_submitted',
      actorDisplayName: 'Mait N',
      actorUsername: 'maitn',
      actorRole: 'requester',
      entityType: 'change_request',
      entityId: 'request-1',
      message: 'Submitted',
      eventDetails: { requestNumber: 1 },
      createdAt: '2026-04-09T09:00:00.000Z',
    });

    expect(
      service.mapObservedEventRow(
        {
          observed_event_id: 10,
          event_source: 'windows-security-log',
          source_system: 'wazuh',
          source_reference: 'evt-1',
          event_id: 4720,
          event_time: new Date('2026-04-09T09:08:00.000Z'),
          event_type: 'user_create',
          title: 'User account created',
          message: 'Created in AD',
          object_guid: 'guid-1',
          distinguished_name: 'CN=John Doe,OU=Users,DC=example,DC=local',
          sam_account_name: 'jdoe',
          subject_account_name: 'administrator',
          payload: { raw: true },
          created_at: new Date('2026-04-09T09:08:05.000Z'),
        },
        'matched',
      ),
    ).toEqual({
      observedEventId: 10,
      eventSource: 'windows-security-log',
      sourceSystem: 'wazuh',
      sourceReference: 'evt-1',
      eventId: 4720,
      eventTime: '2026-04-09T09:08:00.000Z',
      eventType: 'user_create',
      title: 'User account created',
      message: 'Created in AD',
      objectGuid: 'guid-1',
      distinguishedName: 'CN=John Doe,OU=Users,DC=example,DC=local',
      samAccountName: 'jdoe',
      subjectAccountName: 'administrator',
      payload: { raw: true },
      createdAt: '2026-04-09T09:08:05.000Z',
      correlationState: 'matched',
      matchedRequest: null,
    });
  });
});
