import type { ObservedEventIngestDto } from '@acam-ts/contracts';

import type {
  SiemCursor,
  SiemFetchedEvent,
  SiemSourceConfig,
} from './siem.types';
import {
  coerceSortValues,
  extractCnFromDistinguishedName,
  getEventTitle,
  getEventType,
  isDistinguishedNameWithinScope,
  isGroupAddEvent,
  isGroupRemoveEvent,
  normalizeEventId,
} from './siem.utils';

export type ElasticHitSource = {
  '@timestamp'?: string;
  ecs?: { version?: string };
  event?: {
    code?: string | number;
    action?: string;
    category?: string | string[];
  };
  message?: string;
  user?: { name?: string };
  group?: { name?: string };
  winlog?: {
    channel?: string;
    event_id?: string | number;
    provider_name?: string;
    computer_name?: string;
    record_id?: string | number;
    event_data?: Record<string, unknown>;
  };
};

export type ElasticHit = {
  _id: string;
  _index: string;
  _source?: ElasticHitSource;
  sort?: unknown[];
};

export async function normalizeElasticWinlogbeatHit(input: {
  source: SiemSourceConfig;
  hit: ElasticHit;
  cursor: SiemCursor;
  resolveSamAccountNameFromDistinguishedName: (
    distinguishedName: string | undefined,
  ) => Promise<string | null>;
  resolveAccountDistinguishedNameBySamAccountName: (
    samAccountName: string | undefined,
  ) => Promise<string | null>;
  resolveGroupDistinguishedNameBySamAccountName: (
    samAccountName: string | undefined,
  ) => Promise<string | null>;
}): Promise<SiemFetchedEvent | undefined> {
  const rawSource = input.hit._source;
  const eventTime = rawSource?.['@timestamp'];

  if (!rawSource || !eventTime) {
    return undefined;
  }

  const sourceReference = `${input.hit._index}:${input.hit._id}`;

  if (
    input.cursor.lastEventTime === eventTime &&
    input.cursor.lastSourceReference === sourceReference
  ) {
    return undefined;
  }

  const eventId =
    normalizeEventId(rawSource.event?.code) ??
    normalizeEventId(rawSource.winlog?.event_id);

  if (!eventId || !input.source.eventIds.includes(eventId)) {
    return undefined;
  }

  const eventData = rawSource.winlog?.event_data ?? {};
  const memberDistinguishedName = readString(eventData.MemberName);
  const memberSamAccountName =
    readString(eventData.MemberSamAccountName) ??
    (await input.resolveSamAccountNameFromDistinguishedName(
      memberDistinguishedName,
    )) ??
    extractCnFromDistinguishedName(memberDistinguishedName);
  const isMembershipEvent =
    isGroupAddEvent(eventId) || isGroupRemoveEvent(eventId);
  const samAccountName = isMembershipEvent
    ? (readString(eventData.TargetUserName) ??
      rawSource.group?.name ??
      readString(eventData.GroupName))
    : (readString(eventData.SamAccountName) ??
      readString(eventData.TargetUserName) ??
      rawSource.user?.name);
  const distinguishedName = isMembershipEvent
    ? (readString(eventData.ObjectDN) ?? readString(eventData.TargetDn))
    : readString(eventData.ObjectDN);
  const objectGuid =
    readString(eventData.ObjectGUID) ?? readString(eventData.ObjectGuid);
  const scopeMatch = await isEventWithinScope({
    source: input.source,
    eventId,
    distinguishedName,
    memberDistinguishedName,
    samAccountName,
    resolveAccountDistinguishedNameBySamAccountName:
      input.resolveAccountDistinguishedNameBySamAccountName,
    resolveGroupDistinguishedNameBySamAccountName:
      input.resolveGroupDistinguishedNameBySamAccountName,
  });

  if (!scopeMatch) {
    return undefined;
  }

  const observedEvent: ObservedEventIngestDto = {
    eventSource: 'active_directory',
    sourceSystem: input.source.sourceSystem,
    sourceReference,
    eventId,
    eventTime,
    eventType: getEventType(eventId),
    title: getEventTitle(eventId),
    message: buildMessage(rawSource, eventId),
    objectGuid,
    distinguishedName,
    samAccountName: samAccountName ?? null,
    subjectAccountName: isMembershipEvent
      ? (memberSamAccountName ?? null)
      : null,
    payload: {
      index: input.hit._index,
      id: input.hit._id,
      ecsVersion: rawSource.ecs?.version ?? null,
      normalizedAt: new Date().toISOString(),
      raw: rawSource as Record<string, unknown>,
    },
  };

  return {
    observedEvent,
    sort: input.hit.sort
      ? {
          values: coerceSortValues(input.hit.sort),
        }
      : null,
  };
}

function buildMessage(source: ElasticHitSource, eventId: number): string {
  const baseMessage =
    source.message?.trim() ||
    `${getEventTitle(eventId)} observed from ${source.winlog?.provider_name ?? 'Elasticsearch'}.`;

  if (isGroupAddEvent(eventId) || isGroupRemoveEvent(eventId)) {
    const memberName =
      readString(source.winlog?.event_data?.MemberName) ??
      source.user?.name ??
      'unknown member';
    const groupName =
      readString(source.winlog?.event_data?.TargetUserName) ??
      source.group?.name ??
      'unknown group';

    return `${baseMessage}\n\nNormalized target group: ${groupName}\nNormalized member: ${memberName}`;
  }

  return baseMessage;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function isEventWithinScope(input: {
  source: SiemSourceConfig;
  eventId: number;
  distinguishedName: string | undefined;
  memberDistinguishedName: string | undefined;
  samAccountName: string | undefined;
  resolveAccountDistinguishedNameBySamAccountName: (
    samAccountName: string | undefined,
  ) => Promise<string | null>;
  resolveGroupDistinguishedNameBySamAccountName: (
    samAccountName: string | undefined,
  ) => Promise<string | null>;
}): Promise<boolean> {
  if (!input.source.scopeBaseDn) {
    return true;
  }

  const candidateDns = [input.distinguishedName, input.memberDistinguishedName];

  if (
    candidateDns.some((dn) =>
      isDistinguishedNameWithinScope(dn, input.source.scopeBaseDn),
    )
  ) {
    return true;
  }

  if (!input.samAccountName) {
    return false;
  }

  const fallbackDistinguishedName =
    isGroupAddEvent(input.eventId) || isGroupRemoveEvent(input.eventId)
      ? await input.resolveGroupDistinguishedNameBySamAccountName(
          input.samAccountName,
        )
      : await input.resolveAccountDistinguishedNameBySamAccountName(
          input.samAccountName,
        );

  return isDistinguishedNameWithinScope(
    fallbackDistinguishedName,
    input.source.scopeBaseDn,
  );
}
