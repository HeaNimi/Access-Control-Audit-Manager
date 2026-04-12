const POSTGRES_NUL_REPLACEMENT = '[NUL]';
const POSTGRES_NUL_CHARACTER = String.fromCharCode(0);

export function sanitizePostgresText(value: string): string {
  return value
    .split(POSTGRES_NUL_CHARACTER)
    .join(POSTGRES_NUL_REPLACEMENT)
    .replace(/\\u0000/gi, POSTGRES_NUL_REPLACEMENT);
}

export function sanitizePostgresNullableText(
  value: string | null | undefined,
): string | null {
  return value == null ? null : sanitizePostgresText(value);
}

export function sanitizeJsonForPostgres<T>(value: T): T {
  return sanitizeJsonValue(value, new WeakSet<object>()) as T;
}

function sanitizeJsonValue(
  value: unknown,
  seenObjects: WeakSet<object>,
): unknown {
  if (typeof value === 'string') {
    return sanitizePostgresText(value);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (seenObjects.has(value)) {
    return '[Circular]';
  }

  seenObjects.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item, seenObjects));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      sanitizePostgresText(key),
      sanitizeJsonValue(entry, seenObjects),
    ]),
  );
}
