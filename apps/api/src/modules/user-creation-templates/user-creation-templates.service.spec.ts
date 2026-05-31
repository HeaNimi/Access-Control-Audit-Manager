/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { UserCreationTemplatesService } from './user-creation-templates.service';

function createQueryBuilder() {
  const builder = {
    selectAll: jest.fn(() => builder),
    select: jest.fn(() => builder),
    where: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    returningAll: jest.fn(() => builder),
    values: jest.fn(() => builder),
    set: jest.fn(() => builder),
    execute: jest.fn(),
    executeTakeFirst: jest.fn(),
    executeTakeFirstOrThrow: jest.fn(),
  };

  return builder;
}

describe('UserCreationTemplatesService', () => {
  const administrator: AuthenticatedUser = {
    userId: 'admin-1',
    username: 'admin1',
    displayName: 'Administrator',
    roles: ['administrator'],
  };
  const requester: AuthenticatedUser = {
    userId: 'requester-1',
    username: 'requester1',
    displayName: 'Requester',
    roles: ['requester'],
  };

  function createService() {
    const templateQuery = createQueryBuilder();
    const insertTemplateQuery = createQueryBuilder();
    const insertGroupQuery = createQueryBuilder();
    const deleteGroupQuery = createQueryBuilder();
    const updateQuery = createQueryBuilder();
    const transaction = {
      insertInto: jest.fn((table: string) => {
        if (table === 'user_creation_template') {
          return insertTemplateQuery;
        }

        if (table === 'user_creation_template_group') {
          return insertGroupQuery;
        }

        throw new Error(`Unexpected insert table ${table}`);
      }),
      deleteFrom: jest.fn(() => deleteGroupQuery),
      updateTable: jest.fn(() => updateQuery),
    };
    const db = {
      selectFrom: jest.fn(() => templateQuery),
      transaction: jest.fn(() => ({
        execute: jest.fn((callback: (trx: typeof transaction) => unknown) =>
          callback(transaction),
        ),
      })),
    };
    const auditService = {
      write: jest.fn().mockResolvedValue(undefined),
    };
    const appLogService = {
      info: jest.fn(),
    };

    const service = new UserCreationTemplatesService(
      db as never,
      auditService as never,
      appLogService as never,
    );

    return {
      service,
      db,
      templateQuery,
      insertTemplateQuery,
      insertGroupQuery,
      deleteGroupQuery,
      updateQuery,
      auditService,
      appLogService,
    };
  }

  function templateRow(overrides: Record<string, unknown> = {}) {
    return {
      template_id: 'template-1',
      template_name: 'Developer',
      description: null,
      is_active: true,
      sort_order: 0,
      template_version: 5,
      ou_distinguished_name: 'OU=Users,DC=example,DC=local',
      enabled_default: true,
      account_expires_offset_days: null,
      description_template: null,
      upn_suffix: null,
      mail_domain: null,
      created_by_user_id: 'admin-1',
      updated_by_user_id: 'admin-1',
      created_at: new Date('2026-05-01T10:00:00.000Z'),
      updated_at: new Date('2026-05-01T10:00:00.000Z'),
      ...overrides,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists only active templates for non-admin users', async () => {
    const { service, templateQuery } = createService();
    templateQuery.execute.mockResolvedValue([]);

    const result = await service.list(requester);

    expect(result).toEqual([]);
    expect(templateQuery.where).toHaveBeenCalledWith('is_active', '=', true);
  });

  it('rejects inactive listing for non-admin users', async () => {
    const { service } = createService();

    await expect(service.list(requester, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resolves an active template reference for request submission', async () => {
    const { service, templateQuery } = createService();
    templateQuery.executeTakeFirst.mockResolvedValue({
      template_id: 'template-1',
      template_name: 'Developer',
      template_version: 3,
    });

    await expect(service.resolveActiveReference('template-1')).resolves.toEqual(
      {
        templateId: 'template-1',
        templateName: 'Developer',
        templateVersion: 3,
      },
    );
  });

  it('creates a template and audits the change', async () => {
    const {
      service,
      templateQuery,
      insertTemplateQuery,
      insertGroupQuery,
      deleteGroupQuery,
      auditService,
    } = createService();
    const inserted = templateRow();
    const view = {
      templateId: 'template-1',
      templateName: 'Developer',
      description: null,
      isActive: true,
      sortOrder: 0,
      templateVersion: 1,
      ouDistinguishedName: 'OU=Users,DC=example,DC=local',
      enabledDefault: true,
      accountExpiresOffsetDays: null,
      descriptionTemplate: null,
      upnSuffix: null,
      mailDomain: null,
      groupCount: 1,
      groups: [
        {
          distinguishedName: 'CN=Developers,OU=Groups,DC=example,DC=local',
          samAccountName: 'Developers',
          displayName: 'Developers',
          sortOrder: 0,
        },
      ],
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };

    templateQuery.executeTakeFirst.mockResolvedValue(undefined);
    insertTemplateQuery.executeTakeFirstOrThrow.mockResolvedValue(inserted);
    deleteGroupQuery.execute.mockResolvedValue(undefined);
    insertGroupQuery.execute.mockResolvedValue(undefined);
    jest.spyOn(service as never, 'getById').mockResolvedValue(view);

    await service.create(
      {
        templateName: 'Developer',
        ouDistinguishedName: 'OU=Users,DC=example,DC=local',
        enabledDefault: true,
        groups: [
          {
            distinguishedName: 'CN=Developers,OU=Groups,DC=example,DC=local',
            samAccountName: 'Developers',
            displayName: 'Developers',
          },
        ],
      },
      administrator,
    );

    expect(insertTemplateQuery.values).toHaveBeenCalledWith(
      expect.objectContaining({
        template_name: 'Developer',
        ou_distinguished_name: 'OU=Users,DC=example,DC=local',
        enabled_default: true,
        created_by_user_id: administrator.userId,
      }),
    );
    expect(insertGroupQuery.values).toHaveBeenCalledWith([
      expect.objectContaining({
        template_id: 'template-1',
        group_distinguished_name: 'CN=Developers,OU=Groups,DC=example,DC=local',
      }),
    ]);
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user_creation_template_created',
        entityId: 'template-1',
      }),
    );
  });

  it('rejects duplicate template names before create persistence', async () => {
    const { service, templateQuery } = createService();
    templateQuery.executeTakeFirst.mockResolvedValue({ template_id: 'other' });

    await expect(
      service.create({ templateName: 'Developer' }, administrator),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive or missing template references for request submission', async () => {
    const { service, templateQuery } = createService();
    templateQuery.executeTakeFirst.mockResolvedValue(undefined);

    await expect(
      service.resolveActiveReference('template-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid template groups before persistence', async () => {
    const { service } = createService();

    await expect(
      service.create(
        {
          templateName: 'Broken',
          groups: [{} as never],
        },
        administrator,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid expiry offsets before persistence', async () => {
    const { service } = createService();

    await expect(
      service.create(
        {
          templateName: 'Broken',
          accountExpiresOffsetDays: 0,
        },
        administrator,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects personal account fields in template input', async () => {
    const { service } = createService();

    await expect(
      service.create(
        {
          templateName: 'Broken',
          password: 'NeverStoreThis',
        } as never,
        administrator,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('increments template version on update', async () => {
    const { service, updateQuery, auditService } = createService();
    const existing = templateRow();
    const updated = templateRow({
      description: 'Updated',
      template_version: 6,
      updated_at: new Date('2026-05-01T10:05:00.000Z'),
    });
    const internals = service as unknown as {
      getRowById: jest.Mock;
      mapRowsToViews: jest.Mock;
    };

    jest
      .spyOn(service as never, 'getRowById')
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    jest.spyOn(service as never, 'mapRowsToViews').mockResolvedValue([
      {
        templateId: 'template-1',
        templateName: 'Developer',
        description: 'Updated',
        isActive: true,
        sortOrder: 0,
        templateVersion: 6,
        ouDistinguishedName: 'OU=Users,DC=example,DC=local',
        enabledDefault: true,
        accountExpiresOffsetDays: null,
        descriptionTemplate: null,
        upnSuffix: null,
        mailDomain: null,
        groupCount: 0,
        groups: [],
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-01T10:05:00.000Z',
      },
    ]);
    updateQuery.executeTakeFirstOrThrow.mockResolvedValue({});

    await service.update(
      'template-1',
      { description: 'Updated' },
      administrator,
    );

    expect(internals.getRowById).toHaveBeenCalledTimes(2);
    expect(updateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Updated',
        template_version: 6,
      }),
    );
    expect(auditService.write).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'user_creation_template_updated',
        eventDetails: expect.objectContaining({
          previousTemplateVersion: 5,
          templateVersion: 6,
        }),
      }),
    );
  });
});
