import { timingSafeEqual } from 'node:crypto';

import type { Kysely } from 'kysely';
import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AuthLoginResponse,
  AuthProvider,
  AuthUserSearchHit,
  AuthUserSearchResult,
  AuthenticatedUserProfile,
  DirectoryAccountView,
  DirectoryUserSearchHit,
  RoleCode,
  RuntimeHealthCheck,
} from '@acam-ts/contracts';
import { ROLE_CODES } from '@acam-ts/contracts';
import type { DatabaseSchema } from '../../common/database/schema';

import { DATABASE_TOKEN } from '../../common/database/database.constants';
import { normalizeUsername } from '../../common/utils/auth-config.utils';
import {
  parseDelimitedConfigValues,
  readBooleanFlag,
} from '../../common/utils/config.utils';
import { DirectoryService } from '../directory/directory.service';
import { AuthTokenService } from './auth-token.service';

type UserRoleRow = {
  user_id: string;
  username: string;
  display_name: string;
  email: string | null;
  role_code: string | null;
  ad_object_guid: string | null;
  ad_object_sid: string | null;
  distinguished_name: string | null;
};

const PRIVILEGED_ROLE_CODES: Array<Exclude<RoleCode, 'requester'>> = [
  'approver',
  'auditor',
  'administrator',
];

const ROLE_MAPPING_ENV_KEYS: Record<Exclude<RoleCode, 'requester'>, string> = {
  approver: 'AUTH_ROLE_MAP_APPROVER_GROUP_DNS',
  auditor: 'AUTH_ROLE_MAP_AUDITOR_GROUP_DNS',
  administrator: 'AUTH_ROLE_MAP_ADMINISTRATOR_GROUP_DNS',
};

const DEFAULT_LOCAL_ADMIN_USERNAME = 'local_admin';
const LOCAL_ADMIN_DISPLAY_NAME = 'local_admin';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
    private readonly configService: ConfigService,
    private readonly directoryService: DirectoryService,
    private readonly authTokenService: AuthTokenService,
  ) {}

  async login(username: string, password: string): Promise<AuthLoginResponse> {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !password) {
      throw new UnauthorizedException('Username and password are required.');
    }

    if (this.isLocalAdminUsername(normalizedUsername)) {
      return this.loginAsLocalAdministrator(password);
    }

    if (!this.isLdapLoginEnabled()) {
      throw new UnauthorizedException(
        'Active Directory login is currently disabled.',
      );
    }

    const account = await this.directoryService.authenticateUser(
      normalizedUsername,
      password,
    );
    const roles = await this.resolveRolesForDirectoryAccount(account);
    const user = await this.upsertDirectoryUser(account, roles);

    return {
      accessToken: this.authTokenService.issueToken({
        userId: user.userId,
        username: user.username,
        authProvider: user.authProvider,
      }),
      user,
    };
  }

  async searchUsers(
    query: string,
    role?: RoleCode,
  ): Promise<AuthUserSearchResult> {
    const trimmedQuery = query.trim();
    const normalizedRole = role ? this.parseRequestedRole(role) : undefined;
    const uniqueResults = new Map<string, AuthUserSearchHit>();

    const localAdminCandidate = this.getLocalAdminSearchHit(trimmedQuery, role);

    if (localAdminCandidate) {
      uniqueResults.set(
        normalizeUsername(localAdminCandidate.username),
        localAdminCandidate,
      );
    }

    if (trimmedQuery.length >= 2) {
      const roleGroupDns =
        normalizedRole && normalizedRole !== 'requester'
          ? this.getConfiguredRoleGroupDns(normalizedRole)
          : [];
      const searchResults = await this.directoryService.searchUsers(
        trimmedQuery,
        roleGroupDns,
      );

      for (const result of searchResults.results) {
        const roles = await this.resolveRolesForDirectoryUser(result);

        if (normalizedRole && !roles.includes(normalizedRole)) {
          continue;
        }

        uniqueResults.set(normalizeUsername(result.samAccountName), {
          username: result.samAccountName,
          displayName: result.displayName ?? result.samAccountName,
          email: result.mail ?? null,
          roles,
          authProvider: 'ldap',
          distinguishedName: result.distinguishedName,
        });
      }
    }

    const results = Array.from(uniqueResults.values()).sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );

    return {
      query: trimmedQuery,
      role: normalizedRole,
      results,
    };
  }

  async getUserFromAccessToken(
    token: string,
  ): Promise<AuthenticatedUserProfile> {
    const payload = this.authTokenService.verifyToken(token);
    const user = await this.getUserById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Authenticated user was not found.');
    }

    return user;
  }

  async getUserByUsername(
    username: string,
  ): Promise<AuthenticatedUserProfile | undefined> {
    const rows = await this.fetchUsers(normalizeUsername(username));
    return this.groupUsers(rows).at(0);
  }

  async getUserById(
    userId: string,
  ): Promise<AuthenticatedUserProfile | undefined> {
    const rows = await this.db
      .selectFrom('system_user as su')
      .leftJoin('user_role as ur', 'ur.user_id', 'su.user_id')
      .leftJoin('role as r', 'r.role_id', 'ur.role_id')
      .select([
        'su.user_id',
        'su.username',
        'su.display_name',
        'su.email',
        'su.ad_object_guid',
        'su.ad_object_sid',
        'su.distinguished_name',
        'r.role_code',
      ])
      .where('su.user_id', '=', userId)
      .where('su.is_active', '=', true)
      .execute();

    return this.groupUsers(rows).at(0);
  }

  async resolveApproverByUsername(
    username: string,
  ): Promise<AuthenticatedUserProfile> {
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername) {
      throw new BadRequestException('Approver username is required.');
    }

    if (this.isLocalAdminUsername(normalizedUsername)) {
      return this.ensureLocalAdministratorUser();
    }

    const account =
      await this.directoryService.getAccountBySamAccountName(
        normalizedUsername,
      );
    const roles = await this.resolveRolesForDirectoryAccount(account);

    if (!roles.includes('approver')) {
      throw new BadRequestException(
        'The selected approver does not have the approver role.',
      );
    }

    return this.upsertDirectoryUser(account, roles);
  }

  getAuthenticationHealthChecks(): RuntimeHealthCheck[] {
    const checks: RuntimeHealthCheck[] = [];
    const jwtConfigured = this.isJwtConfigured();
    const ldapEnabled = this.isLdapLoginEnabled();
    const localAdminEnabled = this.isLocalAdminLoginEnabled();
    const localAdminConfigured =
      !!this.getLocalAdminUsername() && !!this.getLocalAdminPassword();

    const authenticationStatus: RuntimeHealthCheck['status'] =
      jwtConfigured &&
      (ldapEnabled || (localAdminEnabled && localAdminConfigured))
        ? 'healthy'
        : jwtConfigured && (ldapEnabled || localAdminEnabled)
          ? 'warning'
          : 'error';

    checks.push({
      key: 'authentication',
      label: 'Authentication',
      status: authenticationStatus,
      detail: [
        `LDAP login ${ldapEnabled ? 'enabled' : 'disabled'}`,
        `local admin ${localAdminEnabled ? 'enabled' : 'disabled'}`,
        jwtConfigured ? 'JWT configured' : 'JWT secret missing',
        localAdminEnabled
          ? localAdminConfigured
            ? 'local admin credentials configured'
            : 'local admin credentials incomplete'
          : 'local admin credentials not required',
      ].join(', '),
    });

    const roleMappingCounts = this.getConfiguredRoleMappingCounts();
    const roleMappingStatus: RuntimeHealthCheck['status'] =
      roleMappingCounts.approver > 0
        ? 'healthy'
        : roleMappingCounts.administrator > 0 || roleMappingCounts.auditor > 0
          ? 'warning'
          : 'warning';

    checks.push({
      key: 'role-mapping',
      label: 'Role mapping',
      status: roleMappingStatus,
      detail: `Configured AD group mappings: approver ${roleMappingCounts.approver}, auditor ${roleMappingCounts.auditor}, administrator ${roleMappingCounts.administrator}.`,
    });

    return checks;
  }

  getConfiguredRoleMappingCounts(): Record<
    Exclude<RoleCode, 'requester'>,
    number
  > {
    return {
      approver: this.getConfiguredRoleGroupDns('approver').length,
      auditor: this.getConfiguredRoleGroupDns('auditor').length,
      administrator: this.getConfiguredRoleGroupDns('administrator').length,
    };
  }

  isLdapLoginEnabled(): boolean {
    return readBooleanFlag(
      this.configService.get<string>('AUTH_ENABLE_LDAP_LOGIN'),
      true,
    );
  }

  isLocalAdminLoginEnabled(): boolean {
    return readBooleanFlag(
      this.configService.get<string>('AUTH_ENABLE_LOCAL_ADMIN_LOGIN'),
      true,
    );
  }

  getLocalAdminUsername(): string | undefined {
    const username =
      this.configService.get<string>('AUTH_LOCAL_ADMIN_USERNAME') ??
      DEFAULT_LOCAL_ADMIN_USERNAME;

    return username ? username.trim() : undefined;
  }

  private async loginAsLocalAdministrator(
    password: string,
  ): Promise<AuthLoginResponse> {
    if (!this.isLocalAdminLoginEnabled()) {
      throw new UnauthorizedException('local_admin login is disabled.');
    }

    const configuredPassword = this.getLocalAdminPassword();

    if (!configuredPassword) {
      throw new UnauthorizedException(
        'local_admin credentials are not configured.',
      );
    }

    if (!this.passwordsMatch(password, configuredPassword)) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const user = await this.ensureLocalAdministratorUser();

    return {
      accessToken: this.authTokenService.issueToken({
        userId: user.userId,
        username: user.username,
        authProvider: user.authProvider,
      }),
      user,
    };
  }

  private async ensureLocalAdministratorUser(): Promise<AuthenticatedUserProfile> {
    const username = this.getLocalAdminUsername();

    if (!username) {
      throw new UnauthorizedException(
        'local_admin username is not configured.',
      );
    }

    const roles: RoleCode[] = ['approver', 'administrator'];
    const user = await this.db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto('system_user')
        .values({
          username: normalizeUsername(username),
          display_name: LOCAL_ADMIN_DISPLAY_NAME,
          email: null,
          is_active: true,
          ad_object_guid: null,
          ad_object_sid: null,
          distinguished_name: null,
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column('username').doUpdateSet({
            display_name: LOCAL_ADMIN_DISPLAY_NAME,
            email: null,
            is_active: true,
            ad_object_guid: null,
            ad_object_sid: null,
            distinguished_name: null,
            updated_at: new Date(),
          }),
        )
        .returning(['user_id'])
        .executeTakeFirstOrThrow();

      await this.replaceUserRoles(trx, row.user_id, roles);

      return row;
    });

    const hydratedUser = await this.getUserById(user.user_id);

    if (!hydratedUser) {
      throw new UnauthorizedException(
        'local_admin account could not be loaded.',
      );
    }

    return hydratedUser;
  }

  private async upsertDirectoryUser(
    account: DirectoryAccountView,
    roles: RoleCode[],
  ): Promise<AuthenticatedUserProfile> {
    const user = await this.db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto('system_user')
        .values({
          username: normalizeUsername(account.samAccountName),
          display_name: account.displayName ?? account.samAccountName,
          email: account.mail ?? null,
          is_active: true,
          ad_object_guid: account.objectGuid ?? null,
          ad_object_sid: account.objectSid ?? null,
          distinguished_name: account.distinguishedName,
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column('username').doUpdateSet({
            display_name: account.displayName ?? account.samAccountName,
            email: account.mail ?? null,
            is_active: true,
            ad_object_guid: account.objectGuid ?? null,
            ad_object_sid: account.objectSid ?? null,
            distinguished_name: account.distinguishedName,
            updated_at: new Date(),
          }),
        )
        .returning(['user_id'])
        .executeTakeFirstOrThrow();

      await this.replaceUserRoles(trx, row.user_id, roles);

      return row;
    });

    const hydratedUser = await this.getUserById(user.user_id);

    if (!hydratedUser) {
      throw new UnauthorizedException(
        `Directory-backed user ${account.samAccountName} could not be loaded.`,
      );
    }

    return hydratedUser;
  }

  private async replaceUserRoles(
    db: Kysely<DatabaseSchema>,
    userId: string,
    roles: RoleCode[],
  ): Promise<void> {
    const roleIds = await db
      .selectFrom('role')
      .select(['role_id', 'role_code'])
      .where('role_code', 'in', roles)
      .execute();

    await db.deleteFrom('user_role').where('user_id', '=', userId).execute();

    if (roleIds.length === 0) {
      return;
    }

    await db
      .insertInto('user_role')
      .values(
        roleIds.map((role) => ({ user_id: userId, role_id: role.role_id })),
      )
      .execute();
  }

  private async resolveRolesForDirectoryAccount(
    account: Pick<DirectoryAccountView, 'samAccountName' | 'distinguishedName'>,
  ): Promise<RoleCode[]> {
    const resolvedRoles = new Set<RoleCode>(['requester']);

    for (const role of PRIVILEGED_ROLE_CODES) {
      const groupDns = this.getConfiguredRoleGroupDns(role);

      if (groupDns.length === 0) {
        continue;
      }

      const matches =
        await this.directoryService.hasRecursiveGroupMembershipForUser(
          account.distinguishedName,
          groupDns,
        );

      if (matches) {
        resolvedRoles.add(role);
      }
    }

    return ROLE_CODES.filter((role) => resolvedRoles.has(role));
  }

  private async resolveRolesForDirectoryUser(
    user: Pick<DirectoryUserSearchHit, 'samAccountName' | 'distinguishedName'>,
  ): Promise<RoleCode[]> {
    return this.resolveRolesForDirectoryAccount({
      samAccountName: user.samAccountName,
      distinguishedName: user.distinguishedName,
    });
  }

  private getLocalAdminSearchHit(
    query: string,
    requiredRole?: RoleCode,
  ): AuthUserSearchHit | undefined {
    if (!this.isLocalAdminLoginEnabled()) {
      return undefined;
    }

    const username = this.getLocalAdminUsername();

    if (!username) {
      return undefined;
    }

    const roles: RoleCode[] = ['approver', 'administrator'];

    if (requiredRole && !roles.includes(requiredRole)) {
      return undefined;
    }

    if (!query) {
      return undefined;
    }

    const normalizedQuery = query.toLowerCase();
    const displayName = LOCAL_ADMIN_DISPLAY_NAME;

    if (
      !username.toLowerCase().includes(normalizedQuery) &&
      !displayName.toLowerCase().includes(normalizedQuery)
    ) {
      return undefined;
    }

    return {
      username,
      displayName,
      email: null,
      roles,
      authProvider: 'local',
      distinguishedName: null,
    };
  }

  private async fetchUsers(username?: string): Promise<UserRoleRow[]> {
    let query = this.db
      .selectFrom('system_user as su')
      .leftJoin('user_role as ur', 'ur.user_id', 'su.user_id')
      .leftJoin('role as r', 'r.role_id', 'ur.role_id')
      .select([
        'su.user_id',
        'su.username',
        'su.display_name',
        'su.email',
        'su.ad_object_guid',
        'su.ad_object_sid',
        'su.distinguished_name',
        'r.role_code',
      ])
      .where('su.is_active', '=', true)
      .orderBy('su.display_name', 'asc');

    if (username) {
      query = query.where('su.username', '=', username);
    }

    return query.execute();
  }

  private groupUsers(rows: UserRoleRow[]): AuthenticatedUserProfile[] {
    const grouped = new Map<string, AuthenticatedUserProfile>();

    for (const row of rows) {
      const existing = grouped.get(row.user_id);

      if (existing) {
        if (
          row.role_code &&
          !existing.roles.includes(row.role_code as RoleCode)
        ) {
          existing.roles.push(row.role_code as RoleCode);
        }
        continue;
      }

      grouped.set(row.user_id, {
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        email: row.email,
        roles: row.role_code ? [row.role_code as RoleCode] : [],
        authProvider: this.deriveAuthProvider(row),
      });
    }

    return Array.from(grouped.values()).map((user) => ({
      ...user,
      roles: ROLE_CODES.filter((role) => user.roles.includes(role)),
    }));
  }

  private deriveAuthProvider(row: UserRoleRow): AuthProvider {
    if (this.isLocalAdminUsername(row.username)) {
      return 'local';
    }

    if (row.ad_object_guid || row.ad_object_sid || row.distinguished_name) {
      return 'ldap';
    }

    return 'local';
  }

  private getConfiguredRoleGroupDns(
    role: Exclude<RoleCode, 'requester'>,
  ): string[] {
    const rawValue = this.configService.get<string>(
      ROLE_MAPPING_ENV_KEYS[role],
    );

    return parseDelimitedConfigValues(rawValue);
  }

  private parseRequestedRole(role: string): RoleCode {
    if (ROLE_CODES.includes(role as RoleCode)) {
      return role as RoleCode;
    }

    throw new BadRequestException(`Unsupported role filter ${role}.`);
  }

  private isLocalAdminUsername(username: string): boolean {
    const configuredUsername = this.getLocalAdminUsername();

    if (!configuredUsername) {
      return false;
    }

    return configuredUsername.toLowerCase() === normalizeUsername(username);
  }

  private passwordsMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private getLocalAdminPassword(): string | undefined {
    const password = this.configService.get<string>(
      'AUTH_LOCAL_ADMIN_PASSWORD',
    );

    return password ? password.trim() : undefined;
  }

  private isJwtConfigured(): boolean {
    const secret = this.configService.get<string>('AUTH_JWT_SECRET');
    return !!secret && secret !== 'change-me-jwt-secret';
  }
}
