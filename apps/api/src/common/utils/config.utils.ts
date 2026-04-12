export function readBooleanFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function parseDelimitedConfigValues(
  rawValue: string | undefined | null,
): string[] {
  return (rawValue ?? '')
    .split(/[\r\n;]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function readNumberConfigValue(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}
