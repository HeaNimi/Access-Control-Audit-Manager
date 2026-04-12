import { normalizeUsername } from './auth-config.utils';

describe('auth-config.utils', () => {
  it('normalizes usernames by trimming and lowercasing', () => {
    expect(normalizeUsername('  Mait.N  ')).toBe('mait.n');
  });
});
