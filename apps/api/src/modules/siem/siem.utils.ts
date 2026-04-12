import {
  parseDelimitedConfigValues,
  readBooleanFlag,
} from '../../common/utils/config.utils';
import {
  DEFAULT_SIEM_EVENT_IDS,
  EVENT_TITLE_BY_ID,
  EVENT_TYPE_BY_ID,
  GROUP_ADD_EVENT_IDS,
  GROUP_REMOVE_EVENT_IDS,
} from './siem.constants';

export function readSiemEnabled(value: string | undefined): boolean {
  return readBooleanFlag(value, false);
}

export function readTlsRejectUnauthorized(value: string | undefined): boolean {
  return readBooleanFlag(value, true);
}

export function readSiemEventIds(value: string | undefined): number[] {
  const parsedValues = parseDelimitedConfigValues(value)
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0);

  return parsedValues.length > 0
    ? Array.from(new Set(parsedValues))
    : [...DEFAULT_SIEM_EVENT_IDS];
}

export function readScopeBaseDn(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function isDistinguishedNameWithinScope(
  distinguishedName: string | undefined | null,
  scopeBaseDn: string | undefined,
): boolean {
  if (!distinguishedName || !scopeBaseDn) {
    return false;
  }

  const normalizedDistinguishedName = normalizeDistinguishedName(distinguishedName);
  const normalizedScopeBaseDn = normalizeDistinguishedName(scopeBaseDn);

  return (
    normalizedDistinguishedName === normalizedScopeBaseDn ||
    normalizedDistinguishedName.endsWith(`,${normalizedScopeBaseDn}`)
  );
}

export function normalizeEventId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

export function getEventType(eventId: number | null): string | null {
  if (!eventId) {
    return null;
  }

  return EVENT_TYPE_BY_ID[eventId] ?? null;
}

export function getEventTitle(eventId: number | null): string {
  if (!eventId) {
    return 'Observed Active Directory event';
  }

  return (
    EVENT_TITLE_BY_ID[eventId] ?? `Observed Active Directory event ${eventId}`
  );
}

export function isGroupAddEvent(eventId: number | null): boolean {
  return !!eventId && GROUP_ADD_EVENT_IDS.has(eventId);
}

export function isGroupRemoveEvent(eventId: number | null): boolean {
  return !!eventId && GROUP_REMOVE_EVENT_IDS.has(eventId);
}

export function coerceSortValues(values: unknown): Array<number | string> {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.flatMap((value) => {
    if (typeof value === 'number' || typeof value === 'string') {
      return [value];
    }

    return [];
  });
}

export function extractCnFromDistinguishedName(
  distinguishedName: string | undefined,
): string | undefined {
  if (!distinguishedName) {
    return undefined;
  }

  const match = distinguishedName.match(/CN=([^,]+)/i);
  return match?.[1]?.trim();
}

function normalizeDistinguishedName(distinguishedName: string): string {
  return distinguishedName
    .trim()
    .replace(/\s*,\s*/g, ',')
    .replace(/\s*=\s*/g, '=')
    .toLowerCase();
}
