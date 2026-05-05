import type {
  AccountChangePayload,
  ChangeRequestPayload,
  GroupChangePayload,
  GroupMembershipPayload,
  UserCreatePayload,
} from '@acam-ts/contracts';
import type {
  ChangeRequestRow,
  ObservedEventRow,
} from '../../common/database/schema';

import {
  collectMatchedCorrelationSignals,
  evaluateObservedEventForRequest,
  type ObservedEventRequestEvaluation,
} from './correlation-signals.utils';

type RequestType = ChangeRequestRow['request_type'];

export type CorrelationValidationCandidate = {
  id: string;
  label: string;
  observed: ObservedEventRow;
  expectedMatch: boolean;
  expectedMatchedSignals?: string[];
};

export type CorrelationValidationScenario = {
  id: string;
  label: string;
  request: ChangeRequestRow;
  payload: ChangeRequestPayload;
  candidates: CorrelationValidationCandidate[];
  expectedAggregateSignals?: string[];
};

export type CorrelationValidationCandidateResult =
  CorrelationValidationCandidate & {
    scenarioId: string;
    scenarioLabel: string;
    evaluation: ObservedEventRequestEvaluation;
    actualMatch: boolean;
    classification:
      | 'true_positive'
      | 'true_negative'
      | 'false_positive'
      | 'false_negative';
    signalMatches: boolean;
  };

export type CorrelationValidationMetrics = {
  scenarioCount: number;
  candidatePairCount: number;
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  failedCandidateIds: string[];
  signalFailureIds: string[];
};

export type CorrelationValidationReport = {
  metrics: CorrelationValidationMetrics;
  results: CorrelationValidationCandidateResult[];
  aggregateSignalFailures: Array<{
    scenarioId: string;
    expectedSignals: string[];
    actualSignals: string[];
  }>;
};

const submittedAt = new Date('2026-05-05T10:00:00.000Z');
const eventTime = new Date('2026-05-05T10:00:05.000Z');
const userSid = 'S-1-5-21-4013827353-799469157-2647928806-1126';
const otherUserSid = 'S-1-5-21-4013827353-799469157-2647928806-1199';
const userDn = 'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local';
const renamedUserDn =
  'CN=helper renamed,OU=Users,OU=ManagedObjects,DC=example,DC=local';
const otherUserDn =
  'CN=other user,OU=Users,OU=ManagedObjects,DC=example,DC=local';
const helpdeskDn =
  'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local';
const securityDn =
  'CN=Security,OU=Groups,OU=ManagedObjects,DC=example,DC=local';
const legacyDn =
  'CN=Legacy,OU=Groups,OU=ManagedObjects,DC=example,DC=local';
const financeDn =
  'CN=Finance,OU=Groups,OU=ManagedObjects,DC=example,DC=local';

const helperTarget = {
  distinguishedName: userDn,
  samAccountName: 'helper.james',
  objectSid: userSid,
  displayName: 'Helper James',
};

const helpdeskGroup = {
  distinguishedName: helpdeskDn,
  samAccountName: 'Helpdesk',
  displayName: 'Helpdesk',
};

const securityGroup = {
  distinguishedName: securityDn,
  samAccountName: 'Security',
  displayName: 'Security',
};

const legacyGroup = {
  distinguishedName: legacyDn,
  samAccountName: 'Legacy',
  displayName: 'Legacy',
};

const financeGroup = {
  distinguishedName: financeDn,
  samAccountName: 'Finance',
  displayName: 'Finance',
};

export const CORRELATION_VALIDATION_SCENARIOS: CorrelationValidationScenario[] =
  [
    userCreateScenario('user-create-4720', 'User create matched by 4720', {
      candidates: [
        candidate('user-create-4720-event', '4720 user account created', true, {
          observed: accountEvent(4720, 'user_create', helperTarget),
          expectedMatchedSignals: ['user.create'],
        }),
      ],
    }),
    userCreateScenario('user-create-5137', 'User create matched by 5137', {
      candidates: [
        candidate('user-create-5137-event', '5137 directory object created', true, {
          observed: observedEvent(
            {
              event_id: 5137,
              event_type: 'user_create',
              distinguished_name: userDn,
            },
            {
              ObjectDN: userDn,
              ObjectGUID: '{11111111-1111-1111-1111-111111111111}',
            },
          ),
          expectedMatchedSignals: ['user.create'],
        }),
      ],
    }),
    userCreateScenario('user-create-password', 'Passworded user create matched by 4724', {
      payloadOverrides: {
        target: {
          ...helperTarget,
          givenName: 'Helper',
          surname: 'James',
          password: 'Temporary-Password-123!',
        },
      },
      candidates: [
        candidate('user-create-4724-event', '4724 password reset', true, {
          observed: accountEvent(4724, 'password_reset', helperTarget),
          expectedMatchedSignals: ['account.password'],
        }),
        candidate(
          'user-create-4738-password-last-set-event',
          '4738 password last set updated',
          true,
          {
            observed: observedEvent(
              {
                event_id: 4738,
                event_type: 'account_update',
                sam_account_name: '-',
              },
              {
                TargetUserName: helperTarget.samAccountName,
                TargetSid: userSid,
                SamAccountName: '-',
                DisplayName: '-',
                UserPrincipalName: '-',
                AccountExpires: '-',
                PasswordLastSet: '5/5/2026 11:36:03 PM',
                NewUacValue: '-',
              },
            ),
            expectedMatchedSignals: ['account.password'],
          },
        ),
      ],
    }),
    userCreateScenario('user-create-initial-group', 'Initial group add matched by 4728', {
      payloadOverrides: {
        initialGroups: [helpdeskGroup],
      },
      candidates: [
        candidate('user-create-4728-event', '4728 user added to group', true, {
          observed: groupMembershipEvent(4728, helpdeskGroup, helperTarget),
          expectedMatchedSignals: [`group.add:${helpdeskDn.toLowerCase()}`],
        }),
      ],
    }),
    accountChangeScenario('account-disable-4725', 'Account disable matched by 4725', {
      payload: accountChangePayload({
        changes: [{ attribute: 'enabled', previousValue: 'true', nextValue: 'false' }],
      }),
      candidates: [
        candidate('account-disable-4725-event', '4725 account disabled', true, {
          observed: accountEvent(4725, 'account_disable', helperTarget),
          expectedMatchedSignals: ['account.disable'],
        }),
      ],
    }),
    accountChangeScenario('account-enable-4722', 'Account enable matched by 4722', {
      payload: accountChangePayload({
        changes: [{ attribute: 'enabled', previousValue: 'false', nextValue: 'true' }],
      }),
      candidates: [
        candidate('account-enable-4722-event', '4722 account enabled', true, {
          observed: accountEvent(4722, 'account_enable', helperTarget),
          expectedMatchedSignals: ['account.enable'],
        }),
      ],
    }),
    accountChangeScenario('account-disable-4738-uac', 'Account disable fallback matched by 4738 UAC', {
      payload: accountChangePayload({
        changes: [{ attribute: 'enabled', previousValue: 'true', nextValue: 'false' }],
      }),
      candidates: [
        candidate('account-disable-4738-event', '4738 NewUacValue disabled', true, {
          observed: observedEvent(
            {
              event_id: 4738,
              event_type: 'account_update',
              sam_account_name: helperTarget.samAccountName,
            },
            {
              TargetUserName: helperTarget.samAccountName,
              TargetSid: userSid,
              NewUacValue: '0x202',
            },
          ),
          expectedMatchedSignals: ['account.disable'],
        }),
      ],
    }),
    accountChangeScenario('account-display-name-4738', 'Display-name change matched by 4738', {
      payload: accountChangePayload({
        changes: [
          {
            attribute: 'displayName',
            previousValue: 'Helper James',
            nextValue: 'Helper J.',
          },
        ],
      }),
      candidates: [
        candidate('account-display-name-4738-event', '4738 display name changed', true, {
          observed: observedEvent(
            {
              event_id: 4738,
              event_type: 'account_update',
              sam_account_name: helperTarget.samAccountName,
            },
            {
              TargetUserName: helperTarget.samAccountName,
              TargetSid: userSid,
              DisplayName: 'Helper J.',
            },
          ),
          expectedMatchedSignals: ['account.attr:displayName'],
        }),
      ],
    }),
    accountChangeScenario('account-expiry-4738-placeholder', 'Account expiry matched by 4738 placeholder fallback', {
      requestOverrides: {
        target_object_sid: null,
        target_distinguished_name: null,
        target_sam_account_name: 'test.user10',
        target_display_name: 'Test User 10',
      },
      payload: {
        kind: 'account_change',
        target: {
          samAccountName: 'test.user10',
        },
        changes: [
          {
            attribute: 'accountExpiresAt',
            previousValue: null,
            nextValue: '2026-07-27T20:15:00.000Z',
          },
        ],
      },
      candidates: [
        candidate('account-expiry-4738-event', '4738 account expiry changed', true, {
          observed: observedEvent(
            {
              event_id: 4738,
              event_type: 'account_update',
              sam_account_name: '-',
            },
            {
              TargetUserName: 'test.user10',
              TargetSid: 'S-1-5-21-4013827353-799469157-2647928806-1146',
              SamAccountName: '-',
              AccountExpires: '7/27/2026 11:15:00 PM',
            },
          ),
          expectedMatchedSignals: ['account.attr:accountExpires'],
        }),
      ],
    }),
    accountChangeScenario('ldap-5136-grouped', 'Grouped 5136 LDAP attribute events matched', {
      payload: accountChangePayload({
        changes: [
          { attribute: 'description', previousValue: 'old', nextValue: 'new' },
          { attribute: 'department', previousValue: 'support', nextValue: 'security' },
        ],
      }),
      expectedAggregateSignals: [
        'account.attr:description',
        'account.attr:department',
      ],
      candidates: [
        candidate('ldap-5136-description-event', '5136 description changed', true, {
          observed: ldapAttributeEvent('description', 'new'),
          expectedMatchedSignals: ['account.attr:description'],
        }),
        candidate('ldap-5136-department-event', '5136 department changed', true, {
          observed: ldapAttributeEvent('department', 'security', {
            observed_event_id: 2,
            source_reference: 'winlogbeat:5136-department',
          }),
          expectedMatchedSignals: ['account.attr:department'],
        }),
      ],
    }),
    accountChangeScenario('account-rename-4781', 'Account rename matched by 4781', {
      requestOverrides: {
        target_sam_account_name: 'helper.james',
      },
      payload: accountChangePayload({
        target: {
          ...helperTarget,
          distinguishedName: renamedUserDn,
          samAccountName: 'helper.renamed',
        },
        changes: [
          {
            attribute: 'sAMAccountName',
            previousValue: 'helper.james',
            nextValue: 'helper.renamed',
          },
        ],
      }),
      candidates: [
        candidate('account-rename-4781-event', '4781 account renamed', true, {
          observed: observedEvent(
            {
              event_id: 4781,
              event_type: 'account_rename',
            },
            {
              TargetSid: userSid,
              OldTargetUserName: 'helper.james',
              NewTargetUserName: 'helper.renamed',
            },
          ),
          expectedMatchedSignals: ['account.rename'],
        }),
      ],
    }),
    accountChangeScenario('multi-group-account-change', 'Multi-group add and remove matched', {
      payload: accountChangePayload({
        groupChanges: [
          { operation: 'add', group: securityGroup },
          { operation: 'remove', group: legacyGroup },
        ],
      }),
      candidates: [
        candidate('multi-group-add-4728-event', '4728 security group add', true, {
          observed: groupMembershipEvent(4728, securityGroup, helperTarget),
          expectedMatchedSignals: [`group.add:${securityDn.toLowerCase()}`],
        }),
        candidate('multi-group-remove-4729-event', '4729 legacy group remove', true, {
          observed: groupMembershipEvent(4729, legacyGroup, helperTarget, {
            observed_event_id: 2,
            source_reference: 'winlogbeat:legacy-remove',
          }),
          expectedMatchedSignals: [`group.remove:${legacyDn.toLowerCase()}`],
        }),
      ],
    }),
    groupMembershipScenario('group-membership-add-direct', 'Direct group membership add matched', {
      requestType: 'group_membership_add',
      payload: {
        kind: 'group_membership_add',
        group: helpdeskGroup,
        member: helperTarget,
      },
      candidates: [
        candidate('direct-group-add-4728-event', '4728 direct group add', true, {
          observed: groupMembershipEvent(4728, helpdeskGroup, helperTarget),
        }),
      ],
    }),
    groupMembershipScenario('group-membership-remove-direct', 'Direct group membership remove matched', {
      requestType: 'group_membership_remove',
      payload: {
        kind: 'group_membership_remove',
        group: helpdeskGroup,
        member: helperTarget,
      },
      candidates: [
        candidate('direct-group-remove-4729-event', '4729 direct group remove', true, {
          observed: groupMembershipEvent(4729, helpdeskGroup, helperTarget),
        }),
      ],
    }),
    groupChangeScenario('group-change-member-add', 'Group change member add matched', {
      payload: {
        kind: 'group_change',
        target: helpdeskGroup,
        memberChanges: [{ operation: 'add', member: helperTarget }],
      },
      candidates: [
        candidate('group-change-add-4728-event', '4728 group change member add', true, {
          observed: groupMembershipEvent(4728, helpdeskGroup, helperTarget),
          expectedMatchedSignals: [`member.add:${userSid}`],
        }),
      ],
    }),
    accountChangeScenario('negative-wrong-target', 'Wrong target user does not match', {
      payload: accountChangePayload({
        changes: [{ attribute: 'enabled', previousValue: 'true', nextValue: 'false' }],
      }),
      candidates: [
        candidate('negative-wrong-target-4725-event', '4725 for another user', false, {
          observed: accountEvent(4725, 'account_disable', {
            distinguishedName: otherUserDn,
            samAccountName: 'other.user',
            objectSid: otherUserSid,
          }),
        }),
      ],
    }),
    accountChangeScenario('negative-wrong-signal', 'Right target but wrong changed signal does not match', {
      payload: accountChangePayload({
        changes: [{ attribute: 'department', previousValue: 'support', nextValue: 'sales' }],
      }),
      candidates: [
        candidate('negative-wrong-signal-4738-event', '4738 display name only', false, {
          observed: observedEvent(
            {
              event_id: 4738,
              event_type: 'account_update',
              sam_account_name: helperTarget.samAccountName,
            },
            {
              TargetUserName: helperTarget.samAccountName,
              TargetSid: userSid,
              DisplayName: 'Helper J.',
            },
          ),
        }),
      ],
    }),
    accountChangeScenario('negative-empty-4738', '4738 without meaningful changes does not match', {
      payload: accountChangePayload({
        changes: [
          {
            attribute: 'displayName',
            previousValue: 'Helper James',
            nextValue: 'Helper J.',
          },
        ],
      }),
      candidates: [
        candidate('negative-empty-4738-event', '4738 placeholder-only event', false, {
          observed: observedEvent(
            {
              event_id: 4738,
              event_type: 'account_update',
              sam_account_name: helperTarget.samAccountName,
            },
            {
              TargetUserName: helperTarget.samAccountName,
              TargetSid: userSid,
              DisplayName: '-',
              UserPrincipalName: '-',
              AccountExpires: '-',
              PasswordLastSet: '-',
              NewUacValue: '-',
            },
          ),
        }),
      ],
    }),
    accountChangeScenario('negative-wrong-member', 'Group event with wrong member does not match', {
      payload: accountChangePayload({
        groupChanges: [{ operation: 'add', group: helpdeskGroup }],
      }),
      candidates: [
        candidate('negative-wrong-member-4728-event', '4728 wrong member', false, {
          observed: groupMembershipEvent(4728, helpdeskGroup, {
            distinguishedName: otherUserDn,
            samAccountName: 'other.user',
            objectSid: otherUserSid,
          }),
        }),
      ],
    }),
    accountChangeScenario('negative-wrong-group', 'Group event with wrong target group does not match', {
      payload: accountChangePayload({
        groupChanges: [{ operation: 'add', group: helpdeskGroup }],
      }),
      candidates: [
        candidate('negative-wrong-group-4728-event', '4728 wrong group', false, {
          observed: groupMembershipEvent(4728, financeGroup, helperTarget),
        }),
      ],
    }),
    accountChangeScenario('negative-unexpected-event-id', 'Unrelated event ID does not match', {
      payload: accountChangePayload({
        changes: [{ attribute: 'enabled', previousValue: 'true', nextValue: 'false' }],
      }),
      candidates: [
        candidate('negative-4624-event', '4624 logon event', false, {
          observed: accountEvent(4624, 'logon', helperTarget),
        }),
      ],
    }),
    accountChangeScenario('negative-5136-other-object', '5136 for another object does not match', {
      payload: accountChangePayload({
        changes: [{ attribute: 'description', previousValue: 'old', nextValue: 'new' }],
      }),
      candidates: [
        candidate('negative-5136-other-object-event', '5136 other object DN', false, {
          observed: ldapAttributeEvent('description', 'new', {
            distinguished_name: otherUserDn,
            payload: {
              raw: {
                winlog: {
                  event_data: {
                    ObjectDN: otherUserDn,
                    AttributeLDAPDisplayName: 'description',
                    AttributeValue: 'new',
                    OpCorrelationID: '{different-object}',
                  },
                },
              },
            },
          }),
        }),
      ],
    }),
    accountChangeScenario('negative-out-of-band-siem', 'Out-of-band SIEM event does not match request', {
      payload: accountChangePayload({
        changes: [{ attribute: 'enabled', previousValue: 'true', nextValue: 'false' }],
      }),
      candidates: [
        candidate('negative-out-of-band-siem-event', '4725 unrelated service account', false, {
          observed: accountEvent(4725, 'account_disable', {
            distinguishedName:
              'CN=svc-orphan,OU=ServiceAccounts,DC=example,DC=local',
            samAccountName: 'svc-orphan',
            objectSid: 'S-1-5-21-4013827353-799469157-2647928806-4001',
          }),
        }),
      ],
    }),
  ];

export function evaluateCorrelationValidationScenarios(
  scenarios: CorrelationValidationScenario[] = CORRELATION_VALIDATION_SCENARIOS,
): CorrelationValidationReport {
  const results: CorrelationValidationCandidateResult[] = [];
  const aggregateSignalFailures: CorrelationValidationReport['aggregateSignalFailures'] =
    [];

  for (const scenario of scenarios) {
    for (const validationCandidate of scenario.candidates) {
      const evaluation = evaluateObservedEventForRequest(
        validationCandidate.observed,
        scenario.request,
        scenario.payload,
      );
      const actualMatch = evaluation.matches;
      const classification = classifyCandidate(
        validationCandidate.expectedMatch,
        actualMatch,
      );
      const signalMatches = expectedSignalsMatch(
        validationCandidate.expectedMatchedSignals,
        evaluation.matchedSignals,
      );

      results.push({
        ...validationCandidate,
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        evaluation,
        actualMatch,
        classification,
        signalMatches,
      });
    }

    if (scenario.expectedAggregateSignals) {
      const actualSignals = collectMatchedCorrelationSignals(
        scenario.candidates.map((validationCandidate) => validationCandidate.observed),
        scenario.request,
        scenario.payload,
      );

      if (!sameStringSet(scenario.expectedAggregateSignals, actualSignals)) {
        aggregateSignalFailures.push({
          scenarioId: scenario.id,
          expectedSignals: scenario.expectedAggregateSignals,
          actualSignals,
        });
      }
    }
  }

  const truePositives = results.filter(
    (result) => result.classification === 'true_positive',
  ).length;
  const trueNegatives = results.filter(
    (result) => result.classification === 'true_negative',
  ).length;
  const falsePositives = results.filter(
    (result) => result.classification === 'false_positive',
  ).length;
  const falseNegatives = results.filter(
    (result) => result.classification === 'false_negative',
  ).length;
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);

  return {
    metrics: {
      scenarioCount: scenarios.length,
      candidatePairCount: results.length,
      truePositives,
      trueNegatives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1,
      failedCandidateIds: results
        .filter((result) =>
          ['false_positive', 'false_negative'].includes(result.classification),
        )
        .map((result) => `${result.scenarioId}/${result.id}`),
      signalFailureIds: results
        .filter((result) => !result.signalMatches)
        .map((result) => `${result.scenarioId}/${result.id}`),
    },
    results,
    aggregateSignalFailures,
  };
}

export function formatCorrelationValidationReport(
  report: CorrelationValidationReport,
): string {
  const { metrics } = report;
  const failedScenarioIds = [
    ...metrics.failedCandidateIds,
    ...metrics.signalFailureIds,
    ...report.aggregateSignalFailures.map(
      (failure) => `${failure.scenarioId}/aggregate-signals`,
    ),
  ];

  return [
    'Correlation accuracy validation',
    `Scenarios: ${metrics.scenarioCount}`,
    `Candidate request-event pairs: ${metrics.candidatePairCount}`,
    `True positives: ${metrics.truePositives}`,
    `True negatives: ${metrics.trueNegatives}`,
    `False positives: ${metrics.falsePositives}`,
    `False negatives: ${metrics.falseNegatives}`,
    `Precision: ${formatMetric(metrics.precision)}`,
    `Recall: ${formatMetric(metrics.recall)}`,
    `F1: ${formatMetric(metrics.f1)}`,
    `Failed scenario IDs: ${failedScenarioIds.length > 0 ? failedScenarioIds.join(', ') : 'none'}`,
  ].join('\n');
}

function userCreateScenario(
  id: string,
  label: string,
  input: {
    payloadOverrides?: Partial<UserCreatePayload>;
    candidates: CorrelationValidationCandidate[];
  },
): CorrelationValidationScenario {
  const payload: UserCreatePayload = {
    kind: 'user_create',
    target: {
      ...helperTarget,
      givenName: 'Helper',
      surname: 'James',
      ...(input.payloadOverrides?.target ?? {}),
    },
    initialGroups: input.payloadOverrides?.initialGroups,
  };

  return {
    id,
    label,
    request: requestRow('user_create', payload, {
      target_object_type: 'user',
      target_object_sid: userSid,
      target_distinguished_name: userDn,
      target_sam_account_name: 'helper.james',
      target_display_name: 'Helper James',
    }),
    payload,
    candidates: input.candidates,
  };
}

function accountChangeScenario(
  id: string,
  label: string,
  input: {
    payload: AccountChangePayload;
    candidates: CorrelationValidationCandidate[];
    requestOverrides?: Partial<ChangeRequestRow>;
    expectedAggregateSignals?: string[];
  },
): CorrelationValidationScenario {
  return {
    id,
    label,
    request: requestRow('account_change', input.payload, {
      target_object_type: 'user',
      target_object_sid: userSid,
      target_distinguished_name: userDn,
      target_sam_account_name: 'helper.james',
      target_display_name: 'Helper James',
      ...input.requestOverrides,
    }),
    payload: input.payload,
    candidates: input.candidates,
    expectedAggregateSignals: input.expectedAggregateSignals,
  };
}

function groupChangeScenario(
  id: string,
  label: string,
  input: {
    payload: GroupChangePayload;
    candidates: CorrelationValidationCandidate[];
  },
): CorrelationValidationScenario {
  return {
    id,
    label,
    request: requestRow('group_change', input.payload, {
      target_object_type: 'group',
      target_distinguished_name: input.payload.target.distinguishedName ?? null,
      target_sam_account_name: input.payload.target.samAccountName,
      target_display_name: input.payload.target.displayName ?? null,
    }),
    payload: input.payload,
    candidates: input.candidates,
  };
}

function groupMembershipScenario(
  id: string,
  label: string,
  input: {
    requestType: 'group_membership_add' | 'group_membership_remove';
    payload: GroupMembershipPayload;
    candidates: CorrelationValidationCandidate[];
  },
): CorrelationValidationScenario {
  return {
    id,
    label,
    request: requestRow(input.requestType, input.payload, {
      target_object_type: 'group',
      target_distinguished_name: input.payload.group.distinguishedName ?? null,
      target_sam_account_name: input.payload.group.samAccountName ?? null,
      target_display_name: input.payload.group.displayName ?? null,
    }),
    payload: input.payload,
    candidates: input.candidates,
  };
}

function accountChangePayload(
  overrides: Partial<AccountChangePayload>,
): AccountChangePayload {
  return {
    kind: 'account_change',
    target: helperTarget,
    ...overrides,
  };
}

function requestRow(
  requestType: RequestType,
  payload: ChangeRequestPayload,
  overrides: Partial<ChangeRequestRow> = {},
): ChangeRequestRow {
  return {
    request_id: `request-${requestType}`,
    request_number: 1,
    request_type: requestType,
    status: 'executed',
    title: `Validation ${requestType}`,
    justification: 'Correlation validation fixture.',
    requester_user_id: 'requester-1',
    target_object_type: 'user',
    target_object_guid: null,
    target_object_sid: null,
    target_distinguished_name: null,
    target_sam_account_name: null,
    target_display_name: null,
    request_data: payload as unknown as Record<string, unknown>,
    submitted_at: submittedAt,
    approved_at: submittedAt,
    executed_at: submittedAt,
    closed_at: null,
    ...overrides,
  };
}

function candidate(
  id: string,
  label: string,
  expectedMatch: boolean,
  input: {
    observed: ObservedEventRow;
    expectedMatchedSignals?: string[];
  },
): CorrelationValidationCandidate {
  return {
    id,
    label,
    observed: input.observed,
    expectedMatch,
    expectedMatchedSignals: input.expectedMatchedSignals,
  };
}

function accountEvent(
  eventId: number,
  eventType: string,
  target: {
    distinguishedName?: string | null;
    samAccountName?: string | null;
    objectSid?: string | null;
  },
  overrides: Partial<ObservedEventRow> = {},
): ObservedEventRow {
  return observedEvent(
    {
      event_id: eventId,
      event_type: eventType,
      distinguished_name: target.distinguishedName ?? null,
      sam_account_name: target.samAccountName ?? null,
      ...overrides,
    },
    {
      TargetUserName: target.samAccountName,
      TargetSid: target.objectSid,
      ObjectDN: target.distinguishedName,
    },
  );
}

function groupMembershipEvent(
  eventId: 4728 | 4729 | 4732 | 4733 | 4756 | 4757,
  group: {
    distinguishedName?: string | null;
    samAccountName?: string | null;
  },
  member: {
    distinguishedName?: string | null;
    samAccountName?: string | null;
    objectSid?: string | null;
  },
  overrides: Partial<ObservedEventRow> = {},
): ObservedEventRow {
  return observedEvent(
    {
      event_id: eventId,
      event_type: eventId === 4728 || eventId === 4732 || eventId === 4756
        ? 'group_membership_add'
        : 'group_membership_remove',
      distinguished_name: group.distinguishedName ?? null,
      sam_account_name: group.samAccountName ?? null,
      subject_account_name: member.samAccountName ?? null,
      ...overrides,
    },
    {
      TargetUserName: group.samAccountName,
      TargetSid: 'S-1-5-21-4013827353-799469157-2647928806-2200',
      ObjectDN: group.distinguishedName,
      MemberName: member.distinguishedName,
      MemberSamAccountName: member.samAccountName,
      MemberSid: member.objectSid,
    },
  );
}

function ldapAttributeEvent(
  attributeName: string,
  attributeValue: string,
  overrides: Partial<ObservedEventRow> = {},
): ObservedEventRow {
  return observedEvent(
    {
      event_id: 5136,
      event_type: 'account_update',
      distinguished_name: userDn,
      ...overrides,
    },
    {
      ObjectDN: userDn,
      AttributeLDAPDisplayName: attributeName,
      AttributeValue: attributeValue,
      OpCorrelationID: '{5136-validation-correlation}',
    },
  );
}

function observedEvent(
  overrides: Partial<ObservedEventRow>,
  eventData: Record<string, unknown> = {},
): ObservedEventRow {
  const observedEventId = overrides.observed_event_id ?? 1;

  return {
    observed_event_id: observedEventId,
    event_source: 'active_directory',
    source_system: 'elastic-winlogbeat',
    source_reference:
      overrides.source_reference ?? `winlogbeat:validation-${observedEventId}`,
    event_id: null,
    event_time: eventTime,
    event_type: null,
    title: null,
    message: null,
    object_guid: null,
    distinguished_name: null,
    sam_account_name: null,
    subject_account_name: null,
    payload: {
      raw: {
        winlog: {
          event_data: eventData,
        },
      },
    },
    created_at: eventTime,
    ...overrides,
  };
}

function classifyCandidate(
  expectedMatch: boolean,
  actualMatch: boolean,
): CorrelationValidationCandidateResult['classification'] {
  if (expectedMatch && actualMatch) {
    return 'true_positive';
  }

  if (!expectedMatch && actualMatch) {
    return 'false_positive';
  }

  if (expectedMatch && !actualMatch) {
    return 'false_negative';
  }

  return 'true_negative';
}

function expectedSignalsMatch(
  expectedSignals: string[] | undefined,
  actualSignals: string[],
): boolean {
  return expectedSignals ? sameStringSet(expectedSignals, actualSignals) : true;
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);

  return left.every((entry) => rightSet.has(entry));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}
