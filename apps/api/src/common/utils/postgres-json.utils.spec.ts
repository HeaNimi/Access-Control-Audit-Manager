import {
  sanitizeJsonForPostgres,
  sanitizePostgresNullableText,
  sanitizePostgresText,
} from './postgres-json.utils';

describe('postgres-json.utils', () => {
  it('replaces actual and escaped NUL characters in text', () => {
    expect(sanitizePostgresText('LDAP\u0000error \\u0000 detail')).toBe(
      'LDAP[NUL]error [NUL] detail',
    );
  });

  it('preserves empty strings while normalizing nullable text', () => {
    expect(sanitizePostgresNullableText('')).toBe('');
    expect(sanitizePostgresNullableText(null)).toBeNull();
    expect(sanitizePostgresNullableText(undefined)).toBeNull();
  });

  it('sanitizes nested JSON strings and keys before jsonb persistence', () => {
    expect(
      sanitizeJsonForPostgres({
        'bad\u0000key': {
          message: 'problem 5003\u0000WILL_NOT_PERFORM',
          steps: ['ok', 'failed \\u0000 detail'],
        },
      }),
    ).toEqual({
      'bad[NUL]key': {
        message: 'problem 5003[NUL]WILL_NOT_PERFORM',
        steps: ['ok', 'failed [NUL] detail'],
      },
    });
  });
});
