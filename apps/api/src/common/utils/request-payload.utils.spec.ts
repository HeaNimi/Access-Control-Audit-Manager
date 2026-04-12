import type { ChangeRequestPayload } from '@acam-ts/contracts';

import {
  resolveCreatedDescription,
  sanitizeRequestPayloadForResponse,
} from './request-payload.utils';

describe('request-payload.utils', () => {
  it('resolves created description placeholders and pending request references', () => {
    expect(
      resolveCreatedDescription(
        'created on {{ created_date }} by request {{ request_number }} and request #pending',
        42,
        new Date('2026-04-09T12:00:00.000Z'),
      ),
    ).toBe('created on 2026-04-09 by request 42 and request #42');
  });

  it('redacts temporary passwords in user creation payloads', () => {
    const payload: ChangeRequestPayload = {
      kind: 'user_create',
      target: {
        samAccountName: 'jdoe',
        displayName: 'John Doe',
        givenName: 'John',
        surname: 'Doe',
        password: 'Secret123!',
      },
      initialGroups: [],
    };

    expect(sanitizeRequestPayloadForResponse(payload)).toEqual({
      ...payload,
      target: {
        ...payload.target,
        password: '[redacted]',
      },
    });
  });
});
