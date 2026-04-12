import { Client } from 'ldapts';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import type {
  DirectoryAccountView,
  DirectoryGroupDetailView,
  DirectoryGroupMemberView,
  DirectoryGroupSearchResult,
  DirectoryGroupView,
  DirectoryUserSearchHit,
  DirectoryUserSearchResult,
  RuntimeHealthCheck,
} from '@acam-ts/contracts';

import {
  GROUP_ATTRIBUTES,
  GROUP_DETAIL_ATTRIBUTES,
  MEMBER_ATTRIBUTES,
  USER_ATTRIBUTES,
  USER_SEARCH_ATTRIBUTES,
} from './directory.constants';
import { DirectorySessionService } from './directory-session.service';
import type { LdapEntry } from './directory.types';
import {
  buildPrimaryGroupSid,
  buildRecursiveMemberOfClause,
  buildUserSearchFilter,
  escapeLdapFilterValue,
  getErrorMessage,
  getGroupKey,
  getUserKey,
  mapGroupEntry,
  mapMemberEntry,
  mapUserSearchHit,
  mergeGroups,
  readAccountExpiresAttribute,
  readEnabledState,
  readGuidAttribute,
  readSidAttribute,
  readStringArray,
  readStringAttribute,
  sortGroups,
  sortMembers,
} from './directory.utils';

@Injectable()
export class DirectoryReaderService {
  constructor(private readonly sessionService: DirectorySessionService) {}

  async getAccountBySamAccountName(
    samAccountName: string,
  ): Promise<DirectoryAccountView> {
    const trimmedSamAccountName = samAccountName.trim();

    if (!trimmedSamAccountName) {
      throw new BadRequestException('sAMAccountName is required.');
    }

    const { client, config } = await this.sessionService.createBoundClient();

    try {
      const entry = await this.findUserEntryBySamAccountName(
        client,
        trimmedSamAccountName,
        config.baseDn,
      );

      return await this.mapAccountEntry(client, entry, config.baseDn);
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async getAccountByDistinguishedName(
    distinguishedName: string,
  ): Promise<DirectoryAccountView> {
    const trimmedDistinguishedName = distinguishedName.trim();

    if (!trimmedDistinguishedName) {
      throw new BadRequestException('distinguishedName is required.');
    }

    const { client, config } = await this.sessionService.createBoundClient();

    try {
      const { searchEntries } = await client.search(trimmedDistinguishedName, {
        scope: 'base',
        filter: '(objectClass=*)',
        attributes: USER_ATTRIBUTES,
        sizeLimit: 1,
      });
      const entry = searchEntries.at(0) as LdapEntry | undefined;

      if (!entry) {
        throw new NotFoundException(
          `Active Directory object ${trimmedDistinguishedName} was not found.`,
        );
      }

      return await this.mapAccountEntry(client, entry, config.baseDn);
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async getGroupBySamAccountName(
    samAccountName: string,
  ): Promise<DirectoryGroupDetailView> {
    const trimmedSamAccountName = samAccountName.trim();

    if (!trimmedSamAccountName) {
      throw new BadRequestException('Group sAMAccountName is required.');
    }

    const { client, config } = await this.sessionService.createBoundClient();

    try {
      const entry = await this.findGroupEntryBySamAccountName(
        client,
        trimmedSamAccountName,
        config.baseDn,
      );

      return await this.mapGroupDetailEntry(client, entry);
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async authenticateUser(
    samAccountName: string,
    password: string,
  ): Promise<DirectoryAccountView> {
    const trimmedSamAccountName = samAccountName.trim();

    if (!trimmedSamAccountName || !password) {
      throw new UnauthorizedException('Username and password are required.');
    }

    const { client, config } = await this.sessionService.createBoundClient();
    let account: DirectoryAccountView;

    try {
      const entry = await this.findUserEntryBySamAccountName(
        client,
        trimmedSamAccountName,
        config.baseDn,
      );
      account = await this.mapAccountEntry(client, entry, config.baseDn);
    } finally {
      await client.unbind().catch(() => undefined);
    }

    const userClient = this.sessionService.createClient(config);

    try {
      await this.sessionService.applyStartTlsIfConfigured(userClient, config);
      await userClient.bind(account.distinguishedName, password);
      return account;
    } catch {
      throw new UnauthorizedException('Invalid username or password.');
    } finally {
      await userClient.unbind().catch(() => undefined);
    }
  }

  async searchUsers(
    query: string,
    groupDns: string[] = [],
  ): Promise<DirectoryUserSearchResult> {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return {
        query: trimmedQuery,
        results: [],
      };
    }

    const { client, config } = await this.sessionService.createBoundClient();

    try {
      const filter = buildUserSearchFilter(trimmedQuery, groupDns);
      const { searchEntries } = await client.search(config.baseDn, {
        scope: 'sub',
        filter,
        attributes: USER_SEARCH_ATTRIBUTES,
        sizeLimit: 10,
      });

      const uniqueUsers = new Map<string, DirectoryUserSearchHit>();

      for (const entry of searchEntries as LdapEntry[]) {
        const user = mapUserSearchHit(entry);

        if (!user) {
          continue;
        }

        uniqueUsers.set(getUserKey(user), user);
      }

      return {
        query: trimmedQuery,
        results: Array.from(uniqueUsers.values()).sort((left, right) =>
          (
            left.displayName ??
            left.samAccountName ??
            left.distinguishedName
          ).localeCompare(
            right.displayName ??
              right.samAccountName ??
              right.distinguishedName,
          ),
        ),
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async hasRecursiveGroupMembershipForUser(
    distinguishedName: string,
    groupDns: string[],
  ): Promise<boolean> {
    const trimmedDistinguishedName = distinguishedName.trim();

    if (!trimmedDistinguishedName || groupDns.length === 0) {
      return false;
    }

    const { client, config } = await this.sessionService.createBoundClient();

    try {
      const { searchEntries } = await client.search(config.baseDn, {
        scope: 'sub',
        filter: `(&${[
          '(objectCategory=person)',
          '(objectClass=user)',
          `(distinguishedName=${escapeLdapFilterValue(trimmedDistinguishedName)})`,
          buildRecursiveMemberOfClause(groupDns),
        ].join('')})`,
        attributes: ['distinguishedName'],
        sizeLimit: 1,
      });

      return searchEntries.length > 0;
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async searchGroups(query: string): Promise<DirectoryGroupSearchResult> {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return {
        query: trimmedQuery,
        results: [],
      };
    }

    const { client, config } = await this.sessionService.createBoundClient();

    try {
      const escapedQuery = escapeLdapFilterValue(trimmedQuery);
      const { searchEntries } = await client.search(config.baseDn, {
        scope: 'sub',
        filter: `(&(objectClass=group)(|(cn=*${escapedQuery}*)(displayName=*${escapedQuery}*)(sAMAccountName=*${escapedQuery}*)))`,
        attributes: GROUP_ATTRIBUTES,
        sizeLimit: 25,
      });

      const uniqueGroups = new Map<string, DirectoryGroupView>();

      for (const entry of searchEntries as LdapEntry[]) {
        const group = mapGroupEntry(entry);

        if (!group) {
          continue;
        }

        uniqueGroups.set(getGroupKey(group), group);
      }

      return {
        query: trimmedQuery,
        results: Array.from(uniqueGroups.values()).sort((left, right) =>
          (
            left.displayName ??
            left.samAccountName ??
            left.distinguishedName
          ).localeCompare(
            right.displayName ??
              right.samAccountName ??
              right.distinguishedName,
          ),
        ),
      };
    } finally {
      await client.unbind().catch(() => undefined);
    }
  }

  async getConnectionHealth(): Promise<RuntimeHealthCheck> {
    try {
      const { client, config } = await this.sessionService.createBoundClient();

      try {
        const { searchEntries } = await client.search('', {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: ['defaultNamingContext', 'dnsHostName'],
          sizeLimit: 1,
        });
        const rootDse = (searchEntries.at(0) as LdapEntry | undefined) ?? {};
        const namingContext =
          readStringAttribute(rootDse, 'defaultNamingContext') ?? config.baseDn;
        const host = readStringAttribute(rootDse, 'dnsHostName') ?? config.url;
        const isPasswordWriteProtected =
          this.sessionService.isPasswordWriteConnectionProtected(config);

        return {
          key: 'directory',
          label: 'Active Directory',
          status: isPasswordWriteProtected ? 'healthy' : 'warning',
          detail: isPasswordWriteProtected
            ? `Bound successfully to ${host} and reached ${namingContext}.`
            : `Bound successfully to ${host} and reached ${namingContext}, but password writes require LDAPS or StartTLS. Configure LDAP_URL=ldaps://...:636 or LDAP_START_TLS=true before creating users with temporary passwords.`,
        };
      } finally {
        await client.unbind().catch(() => undefined);
      }
    } catch (error) {
      return {
        key: 'directory',
        label: 'Active Directory',
        status: 'error',
        detail: getErrorMessage(
          error,
          'Active Directory bind or RootDSE lookup failed.',
        ),
      };
    }
  }

  async findDnBySamAccountNameWithFreshClient(
    samAccountName: string,
    baseDn: string,
  ): Promise<string> {
    return this.sessionService.withBoundClient((client) =>
      this.findDnBySamAccountName(client, samAccountName, baseDn),
    );
  }

  private async findUserEntryBySamAccountName(
    client: Client,
    samAccountName: string,
    baseDn: string,
  ): Promise<LdapEntry> {
    const { searchEntries } = await client.search(baseDn, {
      scope: 'sub',
      filter: `(&(objectCategory=person)(objectClass=user)(sAMAccountName=${escapeLdapFilterValue(samAccountName)}))`,
      attributes: USER_ATTRIBUTES,
      sizeLimit: 1,
    });

    const entry = searchEntries.at(0) as LdapEntry | undefined;

    if (!entry) {
      throw new NotFoundException(
        `Active Directory user ${samAccountName} was not found.`,
      );
    }

    return entry;
  }

  private async findGroupEntryBySamAccountName(
    client: Client,
    samAccountName: string,
    baseDn: string,
  ): Promise<LdapEntry> {
    const { searchEntries } = await client.search(baseDn, {
      scope: 'sub',
      filter: `(&(objectClass=group)(sAMAccountName=${escapeLdapFilterValue(samAccountName)}))`,
      attributes: GROUP_DETAIL_ATTRIBUTES,
      sizeLimit: 1,
    });

    const entry = searchEntries.at(0) as LdapEntry | undefined;

    if (!entry) {
      throw new NotFoundException(
        `Active Directory group ${samAccountName} was not found.`,
      );
    }

    return entry;
  }

  private async mapAccountEntry(
    client: Client,
    entry: LdapEntry,
    baseDn: string,
  ): Promise<DirectoryAccountView> {
    const distinguishedName =
      readStringAttribute(entry, 'distinguishedName', 'dn') ?? '';
    const samAccountName = readStringAttribute(entry, 'sAMAccountName') ?? '';

    if (!distinguishedName || !samAccountName) {
      throw new InternalServerErrorException(
        'Active Directory lookup response is missing distinguishedName or sAMAccountName.',
      );
    }

    const directGroups = await this.loadGroupsByDistinguishedNames(
      client,
      readStringArray(entry, 'memberOf'),
    );
    const primaryGroup = await this.loadPrimaryGroupMembership(
      client,
      baseDn,
      readSidAttribute(entry, 'objectSid'),
      readStringAttribute(entry, 'primaryGroupID'),
    );
    const groupMemberships = mergeGroups(
      directGroups,
      primaryGroup ? [primaryGroup] : [],
    );

    return {
      distinguishedName,
      samAccountName,
      displayName:
        readStringAttribute(entry, 'displayName') ??
        readStringAttribute(entry, 'cn'),
      givenName: readStringAttribute(entry, 'givenName'),
      surname: readStringAttribute(entry, 'sn'),
      mail: readStringAttribute(entry, 'mail'),
      userPrincipalName: readStringAttribute(entry, 'userPrincipalName'),
      objectGuid: readGuidAttribute(entry, 'objectGUID'),
      objectSid: readSidAttribute(entry, 'objectSid'),
      department: readStringAttribute(entry, 'department'),
      title: readStringAttribute(entry, 'title'),
      company: readStringAttribute(entry, 'company'),
      telephoneNumber: readStringAttribute(entry, 'telephoneNumber'),
      description: readStringAttribute(entry, 'description') ?? null,
      enabled: readEnabledState(entry, 'userAccountControl'),
      accountExpiresAt: readAccountExpiresAttribute(entry, 'accountExpires'),
      groupMemberships,
    };
  }

  private async loadPrimaryGroupMembership(
    client: Client,
    baseDn: string,
    objectSid?: string,
    primaryGroupIdValue?: string,
  ): Promise<DirectoryGroupView | undefined> {
    const primaryGroupSid = buildPrimaryGroupSid(
      objectSid,
      primaryGroupIdValue,
    );

    if (!primaryGroupSid) {
      return undefined;
    }

    try {
      const { searchEntries } = await client.search(baseDn, {
        scope: 'sub',
        filter: `(&(objectClass=group)(objectSid=${escapeLdapFilterValue(primaryGroupSid)}))`,
        attributes: GROUP_ATTRIBUTES,
        sizeLimit: 1,
      });
      const entry = searchEntries.at(0) as LdapEntry | undefined;

      return entry ? mapGroupEntry(entry) : undefined;
    } catch {
      return undefined;
    }
  }

  private async loadGroupsByDistinguishedNames(
    client: Client,
    distinguishedNames: string[],
  ): Promise<DirectoryGroupView[]> {
    const groups: DirectoryGroupView[] = [];

    for (const distinguishedName of distinguishedNames) {
      try {
        const { searchEntries } = await client.search(distinguishedName, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: GROUP_ATTRIBUTES,
          sizeLimit: 1,
        });
        const entry = searchEntries.at(0) as LdapEntry | undefined;
        const group = entry ? mapGroupEntry(entry) : undefined;

        if (group) {
          groups.push(group);
        }
      } catch {
        continue;
      }
    }

    return sortGroups(groups);
  }

  private async mapGroupDetailEntry(
    client: Client,
    entry: LdapEntry,
  ): Promise<DirectoryGroupDetailView> {
    const group = mapGroupEntry(entry);

    if (!group) {
      throw new InternalServerErrorException(
        'Active Directory group lookup response is missing distinguishedName.',
      );
    }

    const members = await this.loadMembersByDistinguishedNames(
      client,
      readStringArray(entry, 'member'),
    );

    return {
      ...group,
      description: readStringAttribute(entry, 'description') ?? null,
      members,
    };
  }

  private async loadMembersByDistinguishedNames(
    client: Client,
    distinguishedNames: string[],
  ): Promise<DirectoryGroupMemberView[]> {
    const members: DirectoryGroupMemberView[] = [];

    for (const distinguishedName of distinguishedNames) {
      try {
        const { searchEntries } = await client.search(distinguishedName, {
          scope: 'base',
          filter: '(objectClass=*)',
          attributes: MEMBER_ATTRIBUTES,
          sizeLimit: 1,
        });
        const entry = searchEntries.at(0) as LdapEntry | undefined;
        const member = entry ? mapMemberEntry(entry) : undefined;

        if (member) {
          members.push(member);
        }
      } catch {
        continue;
      }
    }

    return sortMembers(members);
  }

  private async findDnBySamAccountName(
    client: Client,
    samAccountName: string,
    baseDn: string,
  ): Promise<string> {
    const { searchEntries } = await client.search(baseDn, {
      scope: 'sub',
      filter: `(sAMAccountName=${escapeLdapFilterValue(samAccountName)})`,
      attributes: ['distinguishedName'],
      sizeLimit: 1,
    });

    const entry = searchEntries.at(0) as LdapEntry | undefined;
    const distinguishedName =
      (entry && readStringAttribute(entry, 'distinguishedName', 'dn')) ??
      undefined;

    if (!distinguishedName) {
      throw new InternalServerErrorException(
        `Could not resolve distinguished name for ${samAccountName}.`,
      );
    }

    return distinguishedName;
  }
}
