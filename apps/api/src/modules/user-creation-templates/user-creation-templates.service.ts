import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type {
  UserCreationTemplateGroupInput,
  UserCreationTemplateGroupView,
  UserCreationTemplateInput,
  UserCreationTemplateReference,
  UserCreationTemplateView,
} from '@acam-ts/contracts';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { DATABASE_TOKEN } from '../../common/database/database.constants';
import type {
  DatabaseSchema,
  NewUserCreationTemplateGroup,
  UserCreationTemplateGroupRow,
  UserCreationTemplateRow,
  UserCreationTemplateUpdate,
} from '../../common/database/schema';
import { AppLogService } from '../../common/logging/app-log.service';
import {
  sanitizePostgresNullableText,
  sanitizePostgresText,
} from '../../common/utils/postgres-json.utils';
import { AuditService } from '../audit/audit.service';

type ParsedTemplateInput = {
  templateName?: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  ouDistinguishedName?: string | null;
  enabledDefault?: boolean | null;
  accountExpiresOffsetDays?: number | null;
  descriptionTemplate?: string | null;
  upnSuffix?: string | null;
  mailDomain?: string | null;
  groups?: UserCreationTemplateGroupInput[];
};

const FORBIDDEN_TEMPLATE_FIELDS = [
  'password',
  'samAccountName',
  'displayName',
  'givenName',
  'surname',
  'userPrincipalName',
  'mail',
] as const;

@Injectable()
export class UserCreationTemplatesService {
  constructor(
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<DatabaseSchema>,
    private readonly auditService: AuditService,
    private readonly appLogService: AppLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    includeInactive = false,
  ): Promise<UserCreationTemplateView[]> {
    if (includeInactive && !this.isAdministrator(actor)) {
      throw new ForbiddenException(
        'Only administrators can list inactive user creation templates.',
      );
    }

    let query = this.db
      .selectFrom('user_creation_template')
      .selectAll()
      .orderBy('sort_order', 'asc')
      .orderBy('template_name', 'asc');

    if (!includeInactive) {
      query = query.where('is_active', '=', true);
    }

    const rows = await query.execute();
    return this.mapRowsToViews(rows);
  }

  async create(
    input: UserCreationTemplateInput,
    actor: AuthenticatedUser,
  ): Promise<UserCreationTemplateView> {
    const parsed = this.parseInput(input, 'create');
    const templateName = parsed.templateName;

    if (!templateName) {
      throw new BadRequestException('Template name is required.');
    }

    await this.assertTemplateNameAvailable(templateName);

    const inserted = await this.db.transaction().execute(async (trx) => {
      const template = await trx
        .insertInto('user_creation_template')
        .values({
          template_name: templateName,
          description: parsed.description ?? null,
          is_active: parsed.isActive ?? true,
          sort_order: parsed.sortOrder ?? 0,
          ou_distinguished_name: parsed.ouDistinguishedName ?? null,
          enabled_default: parsed.enabledDefault ?? true,
          account_expires_offset_days: parsed.accountExpiresOffsetDays ?? null,
          description_template: parsed.descriptionTemplate ?? null,
          upn_suffix: parsed.upnSuffix ?? null,
          mail_domain: parsed.mailDomain ?? null,
          created_by_user_id: actor.userId,
          updated_by_user_id: actor.userId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await this.replaceGroups(trx, template.template_id, parsed.groups ?? []);

      return template;
    });

    const view = await this.getById(inserted.template_id);

    await this.auditService.write({
      actor,
      eventType: 'user_creation_template_created',
      entityType: 'user_creation_template',
      entityId: view.templateId,
      message: `User creation template ${view.templateName} created.`,
      eventDetails: {
        templateId: view.templateId,
        templateName: view.templateName,
        templateVersion: view.templateVersion,
        isActive: view.isActive,
        groupCount: view.groupCount,
      },
    });
    this.appLogService.info('templates', 'User creation template created.', {
      templateId: view.templateId,
      templateName: view.templateName,
      actorUsername: actor.username,
    });

    return view;
  }

  async update(
    templateId: string,
    input: Partial<UserCreationTemplateInput>,
    actor: AuthenticatedUser,
  ): Promise<UserCreationTemplateView> {
    const existing = await this.getRowById(templateId);
    const parsed = this.parseInput(input, 'update');

    if (parsed.templateName) {
      await this.assertTemplateNameAvailable(parsed.templateName, templateId);
    }

    const update: UserCreationTemplateUpdate = {
      updated_by_user_id: actor.userId,
      updated_at: new Date(),
      template_version: existing.template_version + 1,
    };

    if (parsed.templateName !== undefined) {
      update.template_name = parsed.templateName;
    }
    if (parsed.description !== undefined) {
      update.description = parsed.description;
    }
    if (parsed.isActive !== undefined) {
      update.is_active = parsed.isActive;
    }
    if (parsed.sortOrder !== undefined) {
      update.sort_order = parsed.sortOrder;
    }
    if (parsed.ouDistinguishedName !== undefined) {
      update.ou_distinguished_name = parsed.ouDistinguishedName;
    }
    if (parsed.enabledDefault !== undefined) {
      update.enabled_default = parsed.enabledDefault;
    }
    if (parsed.accountExpiresOffsetDays !== undefined) {
      update.account_expires_offset_days = parsed.accountExpiresOffsetDays;
    }
    if (parsed.descriptionTemplate !== undefined) {
      update.description_template = parsed.descriptionTemplate;
    }
    if (parsed.upnSuffix !== undefined) {
      update.upn_suffix = parsed.upnSuffix;
    }
    if (parsed.mailDomain !== undefined) {
      update.mail_domain = parsed.mailDomain;
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('user_creation_template')
        .set(update)
        .where('template_id', '=', templateId)
        .executeTakeFirstOrThrow();

      if (parsed.groups !== undefined) {
        await this.replaceGroups(trx, templateId, parsed.groups);
      }
    });

    const view = await this.getById(templateId);

    await this.auditService.write({
      actor,
      eventType: 'user_creation_template_updated',
      entityType: 'user_creation_template',
      entityId: view.templateId,
      message: `User creation template ${view.templateName} updated.`,
      eventDetails: {
        templateId: view.templateId,
        templateName: view.templateName,
        previousTemplateVersion: existing.template_version,
        templateVersion: view.templateVersion,
        previousIsActive: existing.is_active,
        isActive: view.isActive,
        groupCount: view.groupCount,
      },
    });
    this.appLogService.info('templates', 'User creation template updated.', {
      templateId: view.templateId,
      templateName: view.templateName,
      templateVersion: view.templateVersion,
      actorUsername: actor.username,
    });

    return view;
  }

  async resolveActiveReference(
    templateId: string,
  ): Promise<UserCreationTemplateReference> {
    const row = await this.db
      .selectFrom('user_creation_template')
      .select(['template_id', 'template_name', 'template_version'])
      .where('template_id', '=', templateId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!row) {
      throw new BadRequestException(
        'Selected user creation template is not active or does not exist.',
      );
    }

    return {
      templateId: row.template_id,
      templateName: row.template_name,
      templateVersion: row.template_version,
    };
  }

  private async getById(templateId: string): Promise<UserCreationTemplateView> {
    const row = await this.getRowById(templateId);
    const views = await this.mapRowsToViews([row]);
    const view = views[0];

    if (!view) {
      throw new NotFoundException('User creation template not found.');
    }

    return view;
  }

  private async getRowById(
    templateId: string,
  ): Promise<UserCreationTemplateRow> {
    const row = await this.db
      .selectFrom('user_creation_template')
      .selectAll()
      .where('template_id', '=', templateId)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundException('User creation template not found.');
    }

    return row;
  }

  private async mapRowsToViews(
    rows: UserCreationTemplateRow[],
  ): Promise<UserCreationTemplateView[]> {
    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.template_id);
    const groupRows = await this.db
      .selectFrom('user_creation_template_group')
      .selectAll()
      .where('template_id', 'in', ids)
      .orderBy('template_id', 'asc')
      .orderBy('sort_order', 'asc')
      .orderBy('group_display_name', 'asc')
      .execute();
    const groupsByTemplate = new Map<string, UserCreationTemplateGroupRow[]>();

    for (const group of groupRows) {
      const current = groupsByTemplate.get(group.template_id) ?? [];
      current.push(group);
      groupsByTemplate.set(group.template_id, current);
    }

    return rows.map((row) => {
      const groups = (groupsByTemplate.get(row.template_id) ?? []).map(
        (group) => this.mapGroup(group),
      );

      return {
        templateId: row.template_id,
        templateName: row.template_name,
        description: row.description,
        isActive: row.is_active,
        sortOrder: row.sort_order,
        templateVersion: row.template_version,
        ouDistinguishedName: row.ou_distinguished_name,
        enabledDefault: row.enabled_default,
        accountExpiresOffsetDays: row.account_expires_offset_days,
        descriptionTemplate: row.description_template,
        upnSuffix: row.upn_suffix,
        mailDomain: row.mail_domain,
        groupCount: groups.length,
        groups,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  private mapGroup(
    row: UserCreationTemplateGroupRow,
  ): UserCreationTemplateGroupView {
    return {
      distinguishedName: row.group_distinguished_name,
      samAccountName: row.group_sam_account_name ?? undefined,
      displayName: row.group_display_name ?? undefined,
      objectGuid: row.group_object_guid ?? undefined,
      objectSid: row.group_object_sid ?? undefined,
      sortOrder: row.sort_order,
    };
  }

  private async replaceGroups(
    trx: Pick<Kysely<DatabaseSchema>, 'deleteFrom' | 'insertInto'>,
    templateId: string,
    groups: UserCreationTemplateGroupInput[],
  ): Promise<void> {
    await trx
      .deleteFrom('user_creation_template_group')
      .where('template_id', '=', templateId)
      .execute();

    if (groups.length === 0) {
      return;
    }

    const values: NewUserCreationTemplateGroup[] = groups.map(
      (group, index) => ({
        template_id: templateId,
        group_distinguished_name: sanitizePostgresText(group.distinguishedName),
        group_sam_account_name: sanitizePostgresNullableText(
          group.samAccountName,
        ),
        group_display_name: sanitizePostgresNullableText(group.displayName),
        group_object_guid: sanitizePostgresNullableText(group.objectGuid),
        group_object_sid: sanitizePostgresNullableText(group.objectSid),
        sort_order: group.sortOrder ?? index,
      }),
    );

    await trx
      .insertInto('user_creation_template_group')
      .values(values)
      .execute();
  }

  private async assertTemplateNameAvailable(
    templateName: string,
    currentTemplateId?: string,
  ): Promise<void> {
    let query = this.db
      .selectFrom('user_creation_template')
      .select('template_id')
      .where(sql`lower(template_name)`, '=', templateName.toLowerCase());

    if (currentTemplateId) {
      query = query.where('template_id', '!=', currentTemplateId);
    }

    const existing = await query.executeTakeFirst();

    if (existing) {
      throw new BadRequestException(
        'A user creation template with this name already exists.',
      );
    }
  }

  private parseInput(
    input: Partial<UserCreationTemplateInput>,
    mode: 'create' | 'update',
  ): ParsedTemplateInput {
    if (!this.isObject(input)) {
      throw new BadRequestException('Template input must be an object.');
    }

    for (const field of FORBIDDEN_TEMPLATE_FIELDS) {
      if (field in input) {
        throw new BadRequestException(
          `User creation templates cannot store ${field}.`,
        );
      }
    }

    const source = input as Record<string, unknown>;
    const parsed: ParsedTemplateInput = {};

    if ('templateName' in source || mode === 'create') {
      parsed.templateName = this.readRequiredString(
        source.templateName,
        'templateName',
      );
    }
    if ('description' in source) {
      parsed.description = this.readNullableString(source.description);
    }
    if ('isActive' in source) {
      parsed.isActive = this.readBoolean(source.isActive, 'isActive');
    }
    if ('sortOrder' in source) {
      parsed.sortOrder = this.readInteger(source.sortOrder, 'sortOrder');
    }
    if ('ouDistinguishedName' in source) {
      parsed.ouDistinguishedName = this.readNullableString(
        source.ouDistinguishedName,
      );
    }
    if ('enabledDefault' in source) {
      parsed.enabledDefault =
        source.enabledDefault === null
          ? null
          : this.readBoolean(source.enabledDefault, 'enabledDefault');
    }
    if ('accountExpiresOffsetDays' in source) {
      parsed.accountExpiresOffsetDays = this.readPositiveIntegerOrNull(
        source.accountExpiresOffsetDays,
        'accountExpiresOffsetDays',
      );
    }
    if ('descriptionTemplate' in source) {
      parsed.descriptionTemplate = this.readNullableString(
        source.descriptionTemplate,
      );
    }
    if ('upnSuffix' in source) {
      parsed.upnSuffix = this.readNullableString(source.upnSuffix);
    }
    if ('mailDomain' in source) {
      parsed.mailDomain = this.readNullableString(source.mailDomain);
    }
    if ('groups' in source) {
      parsed.groups = this.readGroups(source.groups);
    }

    return parsed;
  }

  private readGroups(value: unknown): UserCreationTemplateGroupInput[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('groups must be an array.');
    }

    return value.map((entry, index) => {
      if (!this.isObject(entry)) {
        throw new BadRequestException(`groups[${index}] must be an object.`);
      }

      const distinguishedName = this.readRequiredString(
        entry.distinguishedName,
        `groups[${index}].distinguishedName`,
      );

      return {
        distinguishedName,
        samAccountName: this.readOptionalString(entry.samAccountName),
        displayName: this.readOptionalString(entry.displayName),
        objectGuid: this.readOptionalString(entry.objectGuid),
        objectSid: this.readOptionalString(entry.objectSid),
        sortOrder:
          'sortOrder' in entry
            ? this.readInteger(entry.sortOrder, `groups[${index}].sortOrder`)
            : index,
      };
    });
  }

  private readRequiredString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} must be a string.`);
    }

    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException(`${field} is required.`);
    }

    return sanitizePostgresText(normalized);
  }

  private readNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Expected a string or null value.');
    }

    const normalized = value.trim();
    return normalized ? sanitizePostgresText(normalized) : null;
  }

  private readOptionalString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Expected a string value.');
    }

    const normalized = value.trim();
    return normalized ? sanitizePostgresText(normalized) : undefined;
  }

  private readBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} must be a boolean.`);
    }

    return value;
  }

  private readInteger(value: unknown, field: string): number {
    const normalized =
      typeof value === 'string' && value.trim()
        ? Number(value)
        : typeof value === 'number'
          ? value
          : Number.NaN;

    if (!Number.isInteger(normalized)) {
      throw new BadRequestException(`${field} must be an integer.`);
    }

    return normalized;
  }

  private readPositiveIntegerOrNull(
    value: unknown,
    field: string,
  ): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const normalized = this.readInteger(value, field);

    if (normalized <= 0) {
      throw new BadRequestException(`${field} must be greater than zero.`);
    }

    return normalized;
  }

  private isAdministrator(actor: AuthenticatedUser): boolean {
    return actor.roles.includes('administrator');
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
