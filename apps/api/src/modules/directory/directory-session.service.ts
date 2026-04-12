import { Client } from 'ldapts';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { readBooleanFlag } from '../../common/utils/config.utils';
import { deriveUpnSuffix, getErrorMessage } from './directory.utils';
import type { LdapConnectionConfig } from './directory.types';

@Injectable()
export class DirectorySessionService {
  constructor(private readonly configService: ConfigService) {}

  getRequiredLdapConfig(): LdapConnectionConfig {
    const url = this.configService.get<string>('LDAP_URL');
    const bindDn = this.configService.get<string>('LDAP_BIND_DN');
    const bindPassword = this.configService.get<string>('LDAP_BIND_PASSWORD');
    const baseDn = this.configService.get<string>('LDAP_BASE_DN');
    const usersOuDn = this.configService.get<string>('LDAP_USERS_OU_DN');
    const upnSuffix =
      this.configService.get<string>('LDAP_UPN_SUFFIX') ??
      deriveUpnSuffix(baseDn);
    const startTls = readBooleanFlag(
      this.configService.get<string>('LDAP_START_TLS'),
      false,
    );
    const tlsRejectUnauthorized = readBooleanFlag(
      this.configService.get<string>('LDAP_TLS_REJECT_UNAUTHORIZED'),
      true,
    );

    if (!url || !bindDn || !bindPassword || !baseDn) {
      throw new InternalServerErrorException(
        'Active Directory access requires LDAP_URL, LDAP_BIND_DN, LDAP_BIND_PASSWORD and LDAP_BASE_DN.',
      );
    }

    if (bindPassword === 'change-me') {
      throw new InternalServerErrorException(
        'LDAP_BIND_PASSWORD is still using the placeholder value. Set the real service-account password to enable Active Directory access.',
      );
    }

    return {
      url,
      bindDn,
      bindPassword,
      baseDn,
      usersOuDn,
      upnSuffix,
      startTls,
      tlsRejectUnauthorized,
    };
  }

  createClient(config: LdapConnectionConfig): Client {
    return new Client({
      url: config.url,
      tlsOptions: {
        rejectUnauthorized: config.tlsRejectUnauthorized,
      },
    });
  }

  async applyStartTlsIfConfigured(
    client: Client,
    config: LdapConnectionConfig,
  ): Promise<void> {
    if (!config.startTls) {
      return;
    }

    await client.startTLS({
      rejectUnauthorized: config.tlsRejectUnauthorized,
    });
  }

  isPasswordWriteConnectionProtected(config: LdapConnectionConfig): boolean {
    return config.url.toLowerCase().startsWith('ldaps://') || config.startTls;
  }

  async createBoundClient(): Promise<{
    client: Client;
    config: LdapConnectionConfig;
  }> {
    const config = this.getRequiredLdapConfig();
    const client = this.createClient(config);

    try {
      await this.applyStartTlsIfConfigured(client, config);
      await client.bind(config.bindDn, config.bindPassword);
      return { client, config };
    } catch (error) {
      await client.unbind().catch(() => undefined);
      throw new InternalServerErrorException(
        getErrorMessage(
          error,
          'Failed to bind to Active Directory with the configured service account.',
        ),
      );
    }
  }

  async withBoundClient<T>(
    operation: (client: Client, config: LdapConnectionConfig) => Promise<T>,
  ): Promise<T> {
    const { client, config } = await this.createBoundClient();

    try {
      return await operation(client, config);
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }
}
