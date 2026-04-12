import type {
  AccountChangePayload,
  AccountUpdatePayload,
  ChangeRequestPayload,
  DirectoryObjectRef,
  GroupChangePayload,
  GroupMembershipPayload,
  UserCreatePayload,
} from '@acam-ts/contracts';
import type {
  ChangeRequestRow,
  ObservedEventRow,
} from '../../common/database/schema';

import {
  buildDirectorySignalKey,
  matchesDirectoryRef,
  valueMatches,
} from '../../common/utils/directory-ref.utils';
import { ACCOUNT_ATTRIBUTE_EVENT_IDS } from '../siem/siem.constants';

type RequestTarget = Pick<
  ChangeRequestRow,
  | 'request_type'
  | 'target_object_guid'
  | 'target_object_sid'
  | 'target_distinguished_name'
  | 'target_sam_account_name'
>;

type RequestDirectoryRef = Pick<
  ChangeRequestRow,
  | 'target_object_guid'
  | 'target_object_sid'
  | 'target_distinguished_name'
  | 'target_sam_account_name'
>;

type ExecutionResultLike = Record<string, unknown> | null | undefined;
type AccountAttributePayload = AccountChangePayload | AccountUpdatePayload;
type DirectoryRefLike = {
  objectGuid?: string | null;
  objectSid?: string | null;
  distinguishedName?: string | null;
  samAccountName?: string | null;
  displayName?: string | null;
};

type ExecutionStepLike = {
  name: string;
  status: 'completed' | 'failed';
  detail?: Record<string, unknown>;
};

const USER_CREATE_SIGNAL = 'user.create';
const ACCOUNT_ENABLE_SIGNAL = 'account.enable';
const ACCOUNT_DISABLE_SIGNAL = 'account.disable';
const ACCOUNT_RENAME_SIGNAL = 'account.rename';

export function getExpectedEventIds(
  requestType: string,
  payload?: ChangeRequestPayload,
): number[] {
  switch (requestType) {
    case 'user_create':
      return uniqueNumbers([
        4720,
        5137,
        ...(payload?.kind === 'user_create' && (payload.target.enabled ?? true)
          ? [4722, 4738, 5136]
          : []),
        ...(payload?.kind === 'user_create' &&
        (payload.initialGroups?.length ?? 0) > 0
          ? [4728, 4732, 4756]
          : []),
      ]);
    case 'account_change':
      return [
        4722, 4725, 4738, 4781, 5136, 4728, 4729, 4732, 4733, 4756, 4757,
      ];
    case 'group_change':
      return [4728, 4729, 4732, 4733, 4756, 4757];
    case 'account_update':
      return [4722, 4725, 4738, 4781, 5136];
    case 'group_membership_add':
      return [4728, 4732, 4756];
    case 'group_membership_remove':
      return [4729, 4733, 4757];
    default:
      return [];
  }
}

export function getExpectedCorrelationSignals(
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): string[] {
  switch (payload.kind) {
    case 'account_change':
      return getExpectedAccountSignals(payload, executionResult);
    case 'account_update':
      return getExpectedAccountSignals(payload, executionResult);
    case 'user_create':
      return getExpectedUserCreateSignals(payload, executionResult);
    case 'group_change':
      return getExpectedGroupChangeSignals(payload, executionResult);
    default:
      return [];
  }
}

export function getCorrelationSignalsForEvent(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): string[] {
  const expectedSignals = new Set(
    getExpectedCorrelationSignals(payload, executionResult),
  );

  if (expectedSignals.size === 0) {
    return [];
  }

  switch (payload.kind) {
    case 'account_change':
      return getAccountChangeSignalsForEvent(
        event,
        request,
        payload,
        expectedSignals,
        executionResult,
      );
    case 'account_update':
      return getAccountUpdateSignalsForEvent(
        event,
        request,
        payload,
        expectedSignals,
        executionResult,
      );
    case 'user_create':
      return getUserCreateSignalsForEvent(
        event,
        request,
        payload,
        expectedSignals,
        executionResult,
      );
    case 'group_change':
      return getGroupChangeSignalsForEvent(event, request, payload);
    default:
      return [];
  }
}

export function getCorrelationSignalForEvent(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): string | undefined {
  return getCorrelationSignalsForEvent(
    event,
    request,
    payload,
    executionResult,
  )[0];
}

export function collectMatchedCorrelationSignals(
  events: ObservedEventRow[],
  request: RequestDirectoryRef,
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): string[] {
  const groupedEvents = new Map<string, ObservedEventRow[]>();

  for (const event of events) {
    const key = getSignalAggregationKey(event);
    const group = groupedEvents.get(key);

    if (group) {
      group.push(event);
      continue;
    }

    groupedEvents.set(key, [event]);
  }

  const matchedSignals: string[] = [];

  for (const group of groupedEvents.values()) {
    const groupSignals = new Set<string>();

    for (const event of group) {
      for (const signal of getCorrelationSignalsForEvent(
        event,
        request,
        payload,
        executionResult,
      )) {
        groupSignals.add(signal);
      }
    }

    for (const signal of groupSignals) {
      matchedSignals.push(signal);
    }
  }

  return uniqueSignals(matchedSignals);
}

export function doesObservedEventMatchRequest(
  event: ObservedEventRow,
  request: RequestTarget,
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): boolean {
  const expectedEventIds = getExpectedEventIds(request.request_type, payload);
  const matchesEventType =
    expectedEventIds.length === 0 ||
    expectedEventIds.includes(event.event_id ?? -1) ||
    event.event_type === request.request_type;

  if (!matchesEventType) {
    return false;
  }

  if (
    payload.kind === 'account_change' ||
    payload.kind === 'account_update' ||
    payload.kind === 'group_change' ||
    payload.kind === 'user_create'
  ) {
    return (
      getCorrelationSignalsForEvent(event, request, payload, executionResult)
        .length > 0
    );
  }

  const matchesTarget = matchesRequestTarget(event, request, payload);

  if (
    request.request_type === 'group_membership_add' ||
    request.request_type === 'group_membership_remove'
  ) {
    const membershipPayload = payload as GroupMembershipPayload;
    return (
      matchesTarget &&
      matchesDirectoryRef(
        getEventMemberReference(event),
        membershipPayload.member,
      )
    );
  }

  return matchesTarget;
}

function getExpectedAccountSignals(
  payload: AccountAttributePayload,
  executionResult?: ExecutionResultLike,
): string[] {
  const plannedSignals = uniqueSignals([
    ...(payload.changes ?? []).flatMap((change) =>
      toAccountSignalsForRequestedAttribute(
        change.attribute,
        change.nextValue,
      ),
    ),
    ...('groupChanges' in payload
      ? (payload.groupChanges ?? []).map((change) =>
          getGroupSignalKey(change.operation, change.group),
        )
      : []),
  ]);

  const completedSteps = getCompletedExecutionSteps(executionResult);

  if (completedSteps.length === 0) {
    return plannedSignals;
  }

  let recognizedExecution = false;
  const signals: string[] = [];

  for (const change of payload.changes ?? []) {
    const matchesCompletedAttributeStep = completedSteps.some((step) => {
      if (step.name !== 'update-attributes') {
        return false;
      }

      recognizedExecution = true;
      const attributes = readStringArray(readStepDetail(step).attributes);

      return attributes.some((attribute) =>
        areEquivalentAttributeNames(attribute, change.attribute),
      );
    });

    if (!matchesCompletedAttributeStep) {
      continue;
    }

    signals.push(
      ...toAccountSignalsForRequestedAttribute(
        change.attribute,
        change.nextValue,
      ),
    );
  }

  if ('groupChanges' in payload) {
    for (const groupChange of payload.groupChanges ?? []) {
      const matchesCompletedGroupStep = completedSteps.some((step) => {
        if (!isGroupStep(step)) {
          return false;
        }

        recognizedExecution = true;

        return (
          getStepOperation(step) === groupChange.operation &&
          matchesStepReference(step, groupChange.group, 'groupDn')
        );
      });

      if (matchesCompletedGroupStep) {
        signals.push(getGroupSignalKey(groupChange.operation, groupChange.group));
      }
    }
  }

  return recognizedExecution ? uniqueSignals(signals) : plannedSignals;
}

function getExpectedUserCreateSignals(
  payload: UserCreatePayload,
  executionResult?: ExecutionResultLike,
): string[] {
  const plannedSignals = uniqueSignals([
    USER_CREATE_SIGNAL,
    ...(payload.target.enabled ?? true ? [ACCOUNT_ENABLE_SIGNAL] : []),
    ...(payload.initialGroups ?? []).map((group) => getGroupSignalKey('add', group)),
  ]);

  const completedSteps = getCompletedExecutionSteps(executionResult);

  if (completedSteps.length === 0) {
    return plannedSignals;
  }

  let recognizedExecution = false;
  const signals: string[] = [];

  for (const step of completedSteps) {
    if (step.name === 'create-user') {
      recognizedExecution = true;
      signals.push(USER_CREATE_SIGNAL);
      continue;
    }

    if (step.name === 'set-enabled-state') {
      recognizedExecution = true;

      if (readBooleanish(readStepDetail(step).enabled) === true) {
        signals.push(ACCOUNT_ENABLE_SIGNAL);
      }

      continue;
    }

    if (!step.name.startsWith('add-group:')) {
      continue;
    }

    recognizedExecution = true;
    const matchingGroup = (payload.initialGroups ?? []).find((group) =>
      matchesStepReference(step, group, 'groupDn'),
    );

    if (matchingGroup) {
      signals.push(getGroupSignalKey('add', matchingGroup));
    }
  }

  return recognizedExecution ? uniqueSignals(signals) : plannedSignals;
}

function getExpectedGroupChangeSignals(
  payload: GroupChangePayload,
  executionResult?: ExecutionResultLike,
): string[] {
  const plannedSignals = uniqueSignals(
    payload.memberChanges.map((change) =>
      getMemberSignalKey(change.operation, change.member),
    ),
  );
  const completedSteps = getCompletedExecutionSteps(executionResult);

  if (completedSteps.length === 0) {
    return plannedSignals;
  }

  let recognizedExecution = false;
  const signals: string[] = [];

  for (const memberChange of payload.memberChanges) {
    const matchesCompletedStep = completedSteps.some((step) => {
      if (!isMemberStep(step)) {
        return false;
      }

      recognizedExecution = true;

      return (
        getStepOperation(step) === memberChange.operation &&
        matchesStepReference(step, memberChange.member, 'memberDn')
      );
    });

    if (matchesCompletedStep) {
      signals.push(getMemberSignalKey(memberChange.operation, memberChange.member));
    }
  }

  return recognizedExecution ? uniqueSignals(signals) : plannedSignals;
}

function getAccountChangeSignalsForEvent(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: AccountChangePayload,
  expectedSignals: Set<string>,
  executionResult?: ExecutionResultLike,
): string[] {
  const signals: string[] = [];

  if (
    isAccountAttributeEvent(event) &&
    matchesRequestTarget(event, request, payload, executionResult)
  ) {
    for (const signal of getAccountSignalsFromObservedEvent(event)) {
      if (expectedSignals.has(signal)) {
        signals.push(signal);
      }
    }
  }

  if (
    isGroupMembershipEvent(event) &&
    matchesDirectoryRef(
      getEventMemberReference(event),
      getPrimaryTargetReference(request),
    )
  ) {
    const operation = isGroupAddEvent(event) ? 'add' : 'remove';
    const matchingChange = (payload.groupChanges ?? []).find(
      (change) =>
        change.operation === operation &&
        matchesDirectoryRef(getEventTargetReference(event), change.group),
    );

    if (matchingChange) {
      const signal = getGroupSignalKey(operation, matchingChange.group);

      if (expectedSignals.has(signal)) {
        signals.push(signal);
      }
    }
  }

  return uniqueSignals(signals);
}

function getAccountUpdateSignalsForEvent(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: AccountUpdatePayload,
  expectedSignals: Set<string>,
  executionResult?: ExecutionResultLike,
): string[] {
  if (
    !isAccountAttributeEvent(event) ||
    !matchesRequestTarget(event, request, payload, executionResult)
  ) {
    return [];
  }

  return uniqueSignals(
    getAccountSignalsFromObservedEvent(event).filter((signal) =>
      expectedSignals.has(signal),
    ),
  );
}

function getUserCreateSignalsForEvent(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: UserCreatePayload,
  expectedSignals: Set<string>,
  executionResult?: ExecutionResultLike,
): string[] {
  const signals: string[] = [];

  if (
    expectedSignals.has(USER_CREATE_SIGNAL) &&
    (event.event_id === 4720 || event.event_id === 5137) &&
    isUserCreateTargetMatch(event, request, payload, executionResult)
  ) {
    signals.push(USER_CREATE_SIGNAL);
  }

  if (
    expectedSignals.has(ACCOUNT_ENABLE_SIGNAL) &&
    isAccountAttributeEvent(event) &&
    matchesRequestTarget(event, request, payload, executionResult)
  ) {
    if (getAccountSignalsFromObservedEvent(event).includes(ACCOUNT_ENABLE_SIGNAL)) {
      signals.push(ACCOUNT_ENABLE_SIGNAL);
    }
  }

  if (
    isGroupAddEvent(event) &&
    matchesDirectoryRef(
      getEventMemberReference(event),
      getPrimaryTargetReference(request),
    )
  ) {
    const matchingGroup = (payload.initialGroups ?? []).find((group) =>
      matchesDirectoryRef(getEventTargetReference(event), group),
    );

    if (matchingGroup) {
      const signal = getGroupSignalKey('add', matchingGroup);

      if (expectedSignals.has(signal)) {
        signals.push(signal);
      }
    }
  }

  return uniqueSignals(signals);
}

function getGroupChangeSignalsForEvent(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: GroupChangePayload,
): string[] {
  if (!isGroupMembershipEvent(event) || !matchesRequestTarget(event, request, payload)) {
    return [];
  }

  const operation = isGroupAddEvent(event) ? 'add' : 'remove';
  const matchingChange = payload.memberChanges.find(
    (change) =>
      change.operation === operation &&
      matchesDirectoryRef(getEventMemberReference(event), change.member),
  );

  if (!matchingChange) {
    return [];
  }

  return [getMemberSignalKey(operation, matchingChange.member)];
}

function getAccountSignalsFromObservedEvent(event: ObservedEventRow): string[] {
  switch (event.event_id) {
    case 4722:
      return [ACCOUNT_ENABLE_SIGNAL];
    case 4725:
      return [ACCOUNT_DISABLE_SIGNAL];
    case 4781:
      return [ACCOUNT_RENAME_SIGNAL];
    case 4738:
      return getSignalsFrom4738Event(event);
    case 5136:
      return getSignalsFrom5136Event(event);
    default:
      switch (event.event_type) {
        case 'account_enable':
          return [ACCOUNT_ENABLE_SIGNAL];
        case 'account_disable':
          return [ACCOUNT_DISABLE_SIGNAL];
        case 'account_rename':
          return [ACCOUNT_RENAME_SIGNAL];
        default:
          return [];
      }
  }
}

function getSignalsFrom4738Event(event: ObservedEventRow): string[] {
  const eventData = getObservedEventData(event);
  const signals: string[] = [];

  if (readMeaningfulString(eventData.SamAccountName)) {
    signals.push(ACCOUNT_RENAME_SIGNAL);
  }

  if (readMeaningfulString(eventData.DisplayName)) {
    signals.push(toAccountAttributeSignal('displayName'));
  }

  if (readMeaningfulString(eventData.UserPrincipalName)) {
    signals.push(toAccountAttributeSignal('userPrincipalName'));
  }

  if (readMeaningfulString(eventData.AccountExpires)) {
    signals.push(toAccountAttributeSignal('accountExpires'));
  }

  const newUacValue = parseUserAccountControlValue(eventData.NewUacValue);

  if (newUacValue !== null) {
    signals.push(
      isUserAccountControlEnabled(newUacValue)
        ? ACCOUNT_ENABLE_SIGNAL
        : ACCOUNT_DISABLE_SIGNAL,
    );
  }

  return uniqueSignals(signals);
}

function getSignalsFrom5136Event(event: ObservedEventRow): string[] {
  const eventData = getObservedEventData(event);
  const attributeName = normalizeAccountAttributeName(
    readString(eventData.AttributeLDAPDisplayName),
  );

  if (!attributeName || attributeName === 'member') {
    return [];
  }

  if (attributeName === 'sAMAccountName') {
    return [ACCOUNT_RENAME_SIGNAL];
  }

  if (attributeName === 'userAccountControl') {
    const userAccountControl = parseUserAccountControlValue(
      eventData.AttributeValue,
    );

    if (userAccountControl === null) {
      return [];
    }

    return [
      isUserAccountControlEnabled(userAccountControl)
        ? ACCOUNT_ENABLE_SIGNAL
        : ACCOUNT_DISABLE_SIGNAL,
    ];
  }

  return [toAccountAttributeSignal(attributeName)];
}

function getSignalAggregationKey(event: ObservedEventRow): string {
  if (event.event_id !== 5136) {
    return `event:${event.observed_event_id}`;
  }

  const eventData = getObservedEventData(event);
  const objectDn =
    readString(eventData.ObjectDN) ??
    event.distinguished_name ??
    `event:${event.observed_event_id}`;
  const operationCorrelationId =
    readString(eventData.OpCorrelationID) ?? `event:${event.observed_event_id}`;

  return `5136:${objectDn.toLowerCase()}:${operationCorrelationId.toLowerCase()}`;
}

function isUserCreateTargetMatch(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: UserCreatePayload,
  executionResult?: ExecutionResultLike,
): boolean {
  if (matchesRequestTarget(event, request, payload, executionResult)) {
    return true;
  }

  const executionTargetReference = getExecutionResolvedTargetReference(
    payload,
    executionResult,
  );

  if (!executionTargetReference) {
    return false;
  }

  return matchesDirectoryRef(getEventTargetReference(event), executionTargetReference);
}

function matchesRequestTarget(
  event: ObservedEventRow,
  request: RequestDirectoryRef,
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): boolean {
  const eventTargetReference = getEventTargetReference(event);

  for (const reference of getRequestTargetReferences(
    request,
    payload,
    executionResult,
  )) {
    if (matchesDirectoryRef(eventTargetReference, reference)) {
      return true;
    }
  }

  if (isRenamePayload(payload)) {
    const renameChange = getRequestedRenameChange(payload);

    if (
      valueMatches(
        readString(getObservedEventData(event).OldTargetUserName),
        request.target_sam_account_name,
      )
    ) {
      return true;
    }

    if (
      renameChange &&
      valueMatches(
        readString(getObservedEventData(event).NewTargetUserName),
        renameChange.nextValue,
      )
    ) {
      return true;
    }
  }

  return false;
}

function getRequestTargetReferences(
  request: RequestDirectoryRef,
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): DirectoryRefLike[] {
  const references: DirectoryRefLike[] = [getPrimaryTargetReference(request)];
  const executionTargetReference = getExecutionResolvedTargetReference(
    payload,
    executionResult,
  );

  if (executionTargetReference) {
    references.push(executionTargetReference);
  }

  return references;
}

function getPrimaryTargetReference(request: RequestDirectoryRef): DirectoryRefLike {
  return {
    objectGuid: request.target_object_guid,
    objectSid: request.target_object_sid,
    distinguishedName: request.target_distinguished_name,
    samAccountName: request.target_sam_account_name,
  };
}

function getExecutionResolvedTargetReference(
  payload: ChangeRequestPayload,
  executionResult?: ExecutionResultLike,
): DirectoryRefLike | undefined {
  const completedSteps = getCompletedExecutionSteps(executionResult);

  for (const step of completedSteps) {
    const detail = readStepDetail(step);

    if (payload.kind === 'group_change' || isGroupMembershipPayload(payload)) {
      const groupDn = readString(detail.groupDn);

      if (groupDn) {
        return { distinguishedName: groupDn };
      }

      continue;
    }

    const distinguishedName =
      readString(detail.distinguishedName) ?? readString(detail.memberDn);

    if (distinguishedName) {
      return { distinguishedName };
    }
  }

  return undefined;
}

function getCompletedExecutionSteps(
  executionResult?: ExecutionResultLike,
): ExecutionStepLike[] {
  const executionRecord = readRecord(executionResult);

  if (!executionRecord) {
    return [];
  }

  const steps = executionRecord.steps;

  if (!Array.isArray(steps)) {
    return [];
  }

  return steps.reduce<ExecutionStepLike[]>((accumulator, step) => {
    const record = readRecord(step);
    const name = readString(record?.name);
    const status = readString(record?.status);

    if (
      !name ||
      (status !== 'completed' && status !== 'failed')
    ) {
      return accumulator;
    }

    if (status !== 'completed') {
      return accumulator;
    }

    accumulator.push({
      name,
      status,
      detail: readRecord(record?.detail) ?? undefined,
    });

    return accumulator;
  }, []);
}

function getEventTargetReference(event: ObservedEventRow): DirectoryRefLike {
  const eventData = getObservedEventData(event);

  return {
    objectGuid:
      event.object_guid ??
      readString(eventData.ObjectGUID) ??
      readString(eventData.ObjectGuid),
    objectSid:
      readString(eventData.TargetSid) ?? readString(eventData.ObjectSid),
    distinguishedName:
      event.distinguished_name ??
      readString(eventData.ObjectDN) ??
      readString(eventData.TargetDn),
    samAccountName:
      event.sam_account_name ??
      readString(eventData.TargetUserName) ??
      readString(eventData.SamAccountName) ??
      readString(eventData.OldTargetUserName) ??
      readString(eventData.NewTargetUserName),
    displayName: readString(eventData.DisplayName),
  };
}

function getEventMemberReference(event: ObservedEventRow): DirectoryRefLike {
  const eventData = getObservedEventData(event);
  const distinguishedName = readString(eventData.MemberName);

  return {
    objectSid: readString(eventData.MemberSid),
    distinguishedName,
    samAccountName:
      event.subject_account_name ??
      readString(eventData.MemberSamAccountName) ??
      extractCnFromDistinguishedName(distinguishedName),
  };
}

function getObservedEventData(
  event: ObservedEventRow,
): Record<string, unknown> {
  const payload = readRecord(event.payload);
  const raw = readRecord(payload?.raw);
  const winlog = readRecord(raw?.winlog);

  return readRecord(winlog?.event_data) ?? {};
}

function getStepOperation(
  step: ExecutionStepLike,
): 'add' | 'remove' | undefined {
  const detailOperation = readString(readStepDetail(step).operation);

  if (detailOperation === 'add' || detailOperation === 'remove') {
    return detailOperation;
  }

  if (
    step.name.startsWith('add-group:') ||
    step.name.startsWith('add-member:')
  ) {
    return 'add';
  }

  if (
    step.name.startsWith('remove-group:') ||
    step.name.startsWith('remove-member:')
  ) {
    return 'remove';
  }

  return undefined;
}

function matchesStepReference(
  step: ExecutionStepLike,
  reference: DirectoryObjectRef,
  dnFieldName: 'groupDn' | 'memberDn',
): boolean {
  const detail = readStepDetail(step);
  const stepReference: DirectoryRefLike = {
    distinguishedName: readString(detail[dnFieldName]),
    samAccountName: getStepLabel(step),
  };

  return matchesDirectoryRef(stepReference, reference);
}

function readStepDetail(step: ExecutionStepLike): Record<string, unknown> {
  return step.detail ?? {};
}

function isGroupStep(step: ExecutionStepLike): boolean {
  return (
    step.name.startsWith('add-group:') || step.name.startsWith('remove-group:')
  );
}

function isMemberStep(step: ExecutionStepLike): boolean {
  return (
    step.name.startsWith('add-member:') ||
    step.name.startsWith('remove-member:')
  );
}

function getStepLabel(step: ExecutionStepLike): string | undefined {
  const index = step.name.indexOf(':');

  if (index === -1) {
    return undefined;
  }

  const label = step.name.slice(index + 1).trim();
  return label.length > 0 ? label : undefined;
}

function isRenamePayload(
  payload: ChangeRequestPayload,
): payload is AccountChangePayload | AccountUpdatePayload {
  return payload.kind === 'account_change' || payload.kind === 'account_update';
}

function getRequestedRenameChange(
  payload: AccountChangePayload | AccountUpdatePayload,
) {
  return (payload.changes ?? []).find((change) =>
    areEquivalentAttributeNames(change.attribute, 'sAMAccountName'),
  );
}

function isGroupMembershipPayload(
  payload: ChangeRequestPayload,
): payload is GroupMembershipPayload {
  return (
    payload.kind === 'group_membership_add' ||
    payload.kind === 'group_membership_remove'
  );
}

function toAccountSignalsForRequestedAttribute(
  attribute: string,
  nextValue: unknown,
): string[] {
  const normalizedAttribute = normalizeAccountAttributeName(attribute);

  if (!normalizedAttribute) {
    return [];
  }

  if (
    normalizedAttribute === 'enabled' ||
    normalizedAttribute === 'userAccountControl'
  ) {
    const enabled = readBooleanish(nextValue);

    if (enabled === true) {
      return [ACCOUNT_ENABLE_SIGNAL];
    }

    if (enabled === false) {
      return [ACCOUNT_DISABLE_SIGNAL];
    }

    return [];
  }

  if (normalizedAttribute === 'sAMAccountName') {
    return [ACCOUNT_RENAME_SIGNAL];
  }

  return [toAccountAttributeSignal(normalizedAttribute)];
}

function toAccountAttributeSignal(attribute: string): string {
  return `account.attr:${attribute}`;
}

function getGroupSignalKey(
  operation: 'add' | 'remove',
  group: DirectoryObjectRef,
): string {
  return `group.${buildDirectorySignalKey(operation, group, 'group')}`;
}

function getMemberSignalKey(
  operation: 'add' | 'remove',
  member: DirectoryObjectRef,
): string {
  return `member.${buildDirectorySignalKey(operation, member, 'member')}`;
}

function normalizeAccountAttributeName(
  attribute: string | undefined,
): string | undefined {
  if (!attribute) {
    return undefined;
  }

  const normalized = attribute.trim();

  if (!normalized) {
    return undefined;
  }

  switch (normalized.toLowerCase()) {
    case 'surname':
    case 'sn':
      return 'sn';
    case 'accountexpiresat':
    case 'accountexpires':
      return 'accountExpires';
    case 'enabled':
      return 'enabled';
    case 'useraccountcontrol':
      return 'userAccountControl';
    case 'samaccountname':
      return 'sAMAccountName';
    case 'displayname':
      return 'displayName';
    case 'givenname':
      return 'givenName';
    case 'userprincipalname':
      return 'userPrincipalName';
    case 'mail':
      return 'mail';
    case 'department':
      return 'department';
    case 'title':
      return 'title';
    case 'company':
      return 'company';
    case 'telephonenumber':
      return 'telephoneNumber';
    case 'description':
      return 'description';
    case 'member':
      return 'member';
    default:
      return normalized;
  }
}

function areEquivalentAttributeNames(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return (
    normalizeAccountAttributeName(left) === normalizeAccountAttributeName(right)
  );
}

function isAccountAttributeEvent(event: ObservedEventRow): boolean {
  return (
    ACCOUNT_ATTRIBUTE_EVENT_IDS.has(event.event_id ?? -1) ||
    event.event_type === 'account_update' ||
    event.event_type === 'account_enable' ||
    event.event_type === 'account_disable' ||
    event.event_type === 'account_rename'
  );
}

function isGroupMembershipEvent(event: ObservedEventRow): boolean {
  return isGroupAddEvent(event) || isGroupRemoveEvent(event);
}

function isGroupAddEvent(event: ObservedEventRow): boolean {
  return [4728, 4732, 4756].includes(event.event_id ?? -1);
}

function isGroupRemoveEvent(event: ObservedEventRow): boolean {
  return [4729, 4733, 4757].includes(event.event_id ?? -1);
}

function parseUserAccountControlValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  const rawValue = readString(value);

  if (!rawValue) {
    return null;
  }

  const parsed = rawValue.toLowerCase().startsWith('0x')
    ? Number.parseInt(rawValue.slice(2), 16)
    : Number.parseInt(rawValue, 10);

  return Number.isInteger(parsed) ? parsed : null;
}

function isUserAccountControlEnabled(value: number): boolean {
  return (value & 0x2) === 0;
}

function readBooleanish(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return null;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readMeaningfulString(value: unknown): string | undefined {
  const normalized = readString(value);

  if (!normalized || normalized === '-') {
    return undefined;
  }

  return normalized;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => readString(entry))
      .filter((entry): entry is string => !!entry);
  }

  const entry = readString(value);
  return entry ? [entry] : [];
}

function extractCnFromDistinguishedName(
  distinguishedName: string | undefined,
): string | undefined {
  if (!distinguishedName) {
    return undefined;
  }

  const match = distinguishedName.match(/CN=([^,]+)/i);
  return match?.[1]?.trim();
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}

function uniqueSignals(values: string[]): string[] {
  return Array.from(new Set(values));
}
