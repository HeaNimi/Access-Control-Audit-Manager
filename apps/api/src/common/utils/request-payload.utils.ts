import type { ChangeRequestPayload } from '@acam-ts/contracts';

export function resolveCreatedDescription(
  description: string | null,
  requestNumber: number,
  createdAt = new Date(),
): string | null {
  if (!description) {
    return description;
  }

  const createdDate = createdAt.toISOString().slice(0, 10);

  return description
    .replace(/\{\{\s*request_number\s*\}\}/gi, String(requestNumber))
    .replace(/\{\{\s*created_date\s*\}\}/gi, createdDate)
    .replace(/request #pending/gi, `request #${requestNumber}`);
}

export function sanitizeRequestPayloadForResponse(
  payload: ChangeRequestPayload,
): ChangeRequestPayload {
  if (payload.kind !== 'user_create' || !payload.target.password) {
    return payload;
  }

  return {
    ...payload,
    target: {
      ...payload.target,
      password: '[redacted]',
    },
  };
}
