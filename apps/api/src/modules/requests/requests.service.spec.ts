import type {
  ChangeRequestDetail,
  ChangeRequestPayload,
  ChangeRequestSummary,
  RequestTimelineItem,
} from '@acam-ts/contracts';
import { NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { RequestsService } from './requests.service';

function createQueryBuilder() {
  const builder = {
    selectAll: jest.fn(() => builder),
    select: jest.fn(() => builder),
    innerJoin: jest.fn(() => builder),
    where: jest.fn(() => builder),
    whereRef: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    returningAll: jest.fn(() => builder),
    values: jest.fn(() => builder),
    execute: jest.fn(),
    executeTakeFirst: jest.fn(),
    executeTakeFirstOrThrow: jest.fn(),
  };

  return builder;
}

describe('RequestsService object visibility', () => {
  const basePayload: ChangeRequestPayload = {
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

  const requester: AuthenticatedUser = {
    userId: 'requester-1',
    username: 'requester1',
    displayName: 'Requester One',
    roles: ['requester'],
  };

  const approver: AuthenticatedUser = {
    userId: 'approver-1',
    username: 'approver1',
    displayName: 'Approver One',
    roles: ['approver'],
  };

  const administrator: AuthenticatedUser = {
    userId: 'admin-1',
    username: 'admin1',
    displayName: 'Administrator',
    roles: ['administrator'],
  };

  const auditor: AuthenticatedUser = {
    userId: 'auditor-1',
    username: 'auditor1',
    displayName: 'Auditor',
    roles: ['auditor'],
  };

  function createRequestRow(overrides: Record<string, unknown> = {}) {
    return {
      request_id: 'request-1',
      request_number: 1,
      request_type: 'account_change',
      status: 'submitted',
      title: 'Update department',
      justification: 'Business change',
      requester_user_id: requester.userId,
      request_data: basePayload as unknown as Record<string, unknown>,
      submitted_at: new Date('2026-04-15T09:00:00.000Z'),
      approved_at: null,
      executed_at: null,
      ...overrides,
    } as never;
  }

  function createSummary(): ChangeRequestSummary {
    return {
      requestId: 'request-1',
      requestNumber: 1,
      requestType: 'account_change',
      status: 'submitted',
      title: 'Update department',
      justification: 'Business change',
      requesterDisplayName: requester.displayName,
      approverDisplayName: approver.displayName,
      targetSummary: 'Test User 1 (testuser1) · 1 attribute change(s), 0 group change(s)',
      correlationState: 'pending',
      submittedAt: '2026-04-15T09:00:00.000Z',
      approvedAt: null,
      executedAt: null,
    };
  }

  function createDetail(): ChangeRequestDetail {
    return {
      ...createSummary(),
      requester,
      payload: basePayload,
      approvals: [],
      execution: null,
      auditTrail: [],
      observedEvents: [],
      correlations: [],
    };
  }

  function createService() {
    const changeRequestQuery = createQueryBuilder();
    const approvalQuery = createQueryBuilder();
    const transactionChangeRequestQuery = createQueryBuilder();
    const transactionApprovalQuery = createQueryBuilder();
    const transactionUpdateQuery = createQueryBuilder();
    const transaction = {
      insertInto: jest.fn((table: string) => {
        if (table === 'change_request') {
          return transactionChangeRequestQuery;
        }

        if (table === 'request_approval') {
          return transactionApprovalQuery;
        }

        throw new Error(`Unexpected insert table ${table}`);
      }),
      updateTable: jest.fn(() => transactionUpdateQuery),
    };
    const db = {
      selectFrom: jest.fn((table: string) => {
        if (table === 'change_request') {
          return changeRequestQuery;
        }

        if (table === 'request_approval') {
          return approvalQuery;
        }

        throw new Error(`Unexpected select table ${table}`);
      }),
      transaction: jest.fn(() => ({
        execute: jest.fn((callback: (trx: typeof transaction) => unknown) =>
          callback(transaction),
        ),
      })),
    };
    const authService = {
      getUserById: jest.fn(),
      resolveApproverByUsername: jest.fn(),
    };
    const auditService = {
      write: jest.fn().mockResolvedValue(undefined),
      listEntries: jest.fn().mockResolvedValue([]),
    };
    const directoryService = {
      execute: jest.fn(),
    };
    const correlationService = {
      correlateRequest: jest.fn().mockResolvedValue(undefined),
      getRequestCorrelationState: jest.fn().mockResolvedValue('pending'),
    };
    const readModelService = {
      buildChangeRequestSummary: jest.fn(),
      buildRequestTimeline: jest.fn(),
      mapAuditRow: jest.fn(),
      mapObservedEventRow: jest.fn(),
    };

    const service = new RequestsService(
      db as never,
      authService as never,
      auditService as never,
      directoryService as never,
      correlationService as never,
      readModelService as never,
    );

    return {
      service,
      db,
      changeRequestQuery,
      approvalQuery,
      transactionChangeRequestQuery,
      transactionApprovalQuery,
      transactionUpdateQuery,
      authService,
      auditService,
      correlationService,
      readModelService,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filters request list for scoped users', async () => {
    const { service, changeRequestQuery } = createService();
    const summary = createSummary();
    const internals = service as never;

    changeRequestQuery.execute.mockResolvedValue([createRequestRow()]);
    jest.spyOn(internals, 'toSummary').mockResolvedValue(summary);

    const result = await service.list(requester);

    expect(changeRequestQuery.where).toHaveBeenCalledTimes(1);
    expect(changeRequestQuery.orderBy).toHaveBeenCalledWith(
      'submitted_at',
      'desc',
    );
    expect(result).toEqual([summary]);
  });

  it('does not apply scoped visibility filter for auditors', async () => {
    const { service, changeRequestQuery } = createService();
    const summary = createSummary();
    const internals = service as never;

    changeRequestQuery.execute.mockResolvedValue([createRequestRow()]);
    jest.spyOn(internals, 'toSummary').mockResolvedValue(summary);

    await service.list(auditor);

    expect(changeRequestQuery.where).not.toHaveBeenCalled();
  });

  it('returns not found for invisible request detail', async () => {
    const { service, changeRequestQuery } = createService();

    changeRequestQuery.executeTakeFirst.mockResolvedValue(undefined);

    await expect(service.getDetail('request-1', requester)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns not found for invisible request timeline', async () => {
    const { service, changeRequestQuery } = createService();

    changeRequestQuery.executeTakeFirst.mockResolvedValue(undefined);

    await expect(
      service.getTimeline('request-1', requester),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still allows the assigned approver to approve a visible request', async () => {
    const { service, changeRequestQuery, approvalQuery } = createService();
    const detail = createDetail();
    const internals = service as never;

    changeRequestQuery.executeTakeFirst.mockResolvedValue(createRequestRow());
    approvalQuery.executeTakeFirst.mockResolvedValue({
      approval_id: 'approval-1',
      approver_user_id: approver.userId,
      decision: null,
      decision_comment: null,
      decided_at: null,
      created_at: new Date('2026-04-15T09:05:00.000Z'),
      approval_step: 1,
      is_required: true,
      request_id: 'request-1',
    });
    jest
      .spyOn(internals, 'persistApprovalDecision')
      .mockResolvedValue(undefined);
    jest.spyOn(internals, 'executeApprovedRequest').mockResolvedValue(undefined);
    jest.spyOn(service, 'getDetail').mockResolvedValue(detail);

    const result = await service.decide(
      'request-1',
      { decision: 'approved' },
      approver,
    );

    expect(result).toEqual(detail);
    expect(service.getDetail).toHaveBeenCalledWith('request-1', approver);
  });

  it('still allows administrator retry on a visible failed request', async () => {
    const { service, changeRequestQuery, approvalQuery } = createService();
    const detail = createDetail();
    const internals = service as never;

    changeRequestQuery.executeTakeFirst.mockResolvedValue(
      createRequestRow({ status: 'failed' }),
    );
    approvalQuery.executeTakeFirst.mockResolvedValue({
      approval_id: 'approval-1',
      approver_user_id: approver.userId,
      decision: 'approved',
      decision_comment: null,
      decided_at: new Date('2026-04-15T09:04:00.000Z'),
      created_at: new Date('2026-04-15T09:01:00.000Z'),
      approval_step: 1,
      is_required: true,
      request_id: 'request-1',
    });
    jest.spyOn(internals, 'loadExecution').mockResolvedValue({
      execution_id: 'execution-1',
      request_id: 'request-1',
      execution_status: 'failed',
      error_message: 'Previous failure',
      execution_result: {},
      started_at: new Date('2026-04-15T09:06:00.000Z'),
      finished_at: new Date('2026-04-15T09:07:00.000Z'),
      created_at: new Date('2026-04-15T09:06:00.000Z'),
      updated_at: new Date('2026-04-15T09:07:00.000Z'),
    });
    jest.spyOn(internals, 'executeApprovedRequest').mockResolvedValue(undefined);
    jest.spyOn(service, 'getDetail').mockResolvedValue(detail);

    const result = await service.retryExecution('request-1', administrator);

    expect(result).toEqual(detail);
    expect(service.getDetail).toHaveBeenCalledWith('request-1', administrator);
  });

  it('returns created request detail using the requesters visibility context', async () => {
    const {
      service,
      authService,
      transactionChangeRequestQuery,
      transactionApprovalQuery,
      transactionUpdateQuery,
    } = createService();
    const detail = createDetail();

    authService.resolveApproverByUsername.mockResolvedValue({
      userId: approver.userId,
      username: approver.username,
      displayName: approver.displayName,
      roles: approver.roles,
    });
    transactionChangeRequestQuery.executeTakeFirstOrThrow.mockResolvedValue(
      createRequestRow(),
    );
    transactionApprovalQuery.execute.mockResolvedValue(undefined);
    transactionUpdateQuery.execute.mockResolvedValue(undefined);
    jest.spyOn(service, 'getDetail').mockResolvedValue(detail);

    const result = await service.create(
      {
        title: 'Update department',
        justification: 'Business change',
        approverUsername: approver.username,
        payload: basePayload,
      },
      requester,
    );

    expect(result).toEqual(detail);
    expect(service.getDetail).toHaveBeenCalledWith('request-1', requester);
  });
});
