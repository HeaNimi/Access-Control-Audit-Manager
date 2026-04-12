export interface LdapConnectionConfig {
  url: string;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  usersOuDn?: string;
  upnSuffix?: string;
  startTls: boolean;
  tlsRejectUnauthorized: boolean;
}

export type LdapEntry = Record<string, unknown>;

export type LdapExecutionStep = {
  name: string;
  status: 'completed' | 'failed';
  attempts: number;
  detail?: Record<string, unknown>;
};

export class LdapStepError extends Error {
  constructor(
    readonly stepName: string,
    readonly attempts: number,
    readonly cause: unknown,
  ) {
    super(`LDAP step ${stepName} failed after ${attempts} attempt(s).`);
  }
}
