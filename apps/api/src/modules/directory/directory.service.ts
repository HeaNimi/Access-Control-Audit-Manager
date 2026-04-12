import { Injectable } from '@nestjs/common';

import type {
  DirectoryAccountView,
  DirectoryExecutionContext,
  DirectoryExecutionResult,
  DirectoryGroupDetailView,
  DirectoryGroupSearchResult,
  DirectoryUserSearchResult,
  RuntimeHealthCheck,
} from '@acam-ts/contracts';

import { DirectoryReaderService } from './directory-reader.service';
import { DirectoryWriterService } from './directory-writer.service';

@Injectable()
export class DirectoryService {
  constructor(
    private readonly readerService: DirectoryReaderService,
    private readonly writerService: DirectoryWriterService,
  ) {}

  async execute(
    context: DirectoryExecutionContext,
  ): Promise<DirectoryExecutionResult> {
    return this.writerService.execute(context);
  }

  async getAccountBySamAccountName(
    samAccountName: string,
  ): Promise<DirectoryAccountView> {
    return this.readerService.getAccountBySamAccountName(samAccountName);
  }

  async getAccountByDistinguishedName(
    distinguishedName: string,
  ): Promise<DirectoryAccountView> {
    return this.readerService.getAccountByDistinguishedName(distinguishedName);
  }

  async getGroupBySamAccountName(
    samAccountName: string,
  ): Promise<DirectoryGroupDetailView> {
    return this.readerService.getGroupBySamAccountName(samAccountName);
  }

  async authenticateUser(
    samAccountName: string,
    password: string,
  ): Promise<DirectoryAccountView> {
    return this.readerService.authenticateUser(samAccountName, password);
  }

  async searchUsers(
    query: string,
    groupDns: string[] = [],
  ): Promise<DirectoryUserSearchResult> {
    return this.readerService.searchUsers(query, groupDns);
  }

  async hasRecursiveGroupMembershipForUser(
    distinguishedName: string,
    groupDns: string[],
  ): Promise<boolean> {
    return this.readerService.hasRecursiveGroupMembershipForUser(
      distinguishedName,
      groupDns,
    );
  }

  async searchGroups(query: string): Promise<DirectoryGroupSearchResult> {
    return this.readerService.searchGroups(query);
  }

  async getConnectionHealth(): Promise<RuntimeHealthCheck> {
    return this.readerService.getConnectionHealth();
  }
}
