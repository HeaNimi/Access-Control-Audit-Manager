import {
  parseDelimitedConfigValues,
  readBooleanFlag,
  readNumberConfigValue,
} from './config.utils';

describe('config.utils', () => {
  it('parses truthy boolean flag values and falls back when unset', () => {
    expect(readBooleanFlag(undefined, true)).toBe(true);
    expect(readBooleanFlag('YES', false)).toBe(true);
    expect(readBooleanFlag('off', true)).toBe(false);
  });

  it('parses semicolon and newline delimited values', () => {
    expect(
      parseDelimitedConfigValues(
        'CN=Helpdesk,DC=example,DC=local;\nCN=Admins,DC=example,DC=local',
      ),
    ).toEqual([
      'CN=Helpdesk,DC=example,DC=local',
      'CN=Admins,DC=example,DC=local',
    ]);
  });

  it('parses positive numeric config values with a fallback', () => {
    expect(readNumberConfigValue('25', 10)).toBe(25);
    expect(readNumberConfigValue('0', 10)).toBe(10);
    expect(readNumberConfigValue('not-a-number', 10)).toBe(10);
    expect(readNumberConfigValue(undefined, 10)).toBe(10);
  });
});
