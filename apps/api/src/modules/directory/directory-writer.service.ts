import { Attribute, Change, Client } from 'ldapts';
import { Injectable } from '@nestjs/common';

import type {
  AccountChangePayload,
  AccountUpdatePayload,
  ChangeRequestPayload,
  DirectoryExecutionContext,
  DirectoryExecutionResult,
  GroupChangePayload,
  GroupMembershipPayload,
  UserCreatePayload,
} from '@acam-ts/contracts';

import { DirectoryReaderService } from './directory-reader.service';
import { DirectorySessionService } from './directory-session.service';
import type {
  LdapConnectionConfig,
  LdapExecutionStep,
} from './directory.types';
import { LdapStepError } from './directory.types';
import {
  encodeUnicodePassword,
  getFailureIdentifier,
  getRawErrorMessage,
  getUserAccountControlValue,
  isRetryableLdapSocketError,
  isoStringToAccountExpires,
  parseEnabledValue,
} from './directory.utils';

@Injectable()
export class DirectoryWriterService {
  constructor(
    private readonly sessionService: DirectorySessionService,
    private readonly readerService: DirectoryReaderService,
  ) {}

  async execute(
    context: DirectoryExecutionContext,
  ): Promise<DirectoryExecutionResult> {
    const mode = this.sessionService.getDirectoryMode();

    if (mode === 'ldap') {
      return this.executeWithLdap(context);
    }

    return this.executeInMockMode(context.payload);
  }

  private executeInMockMode(
    payload: ChangeRequestPayload,
  ): DirectoryExecutionResult {
    const identifier = getFailureIdentifier(payload);
    const defaultUsersOuDn = this.sessionService.getDefaultUsersOuDn();

    if (identifier?.startsWith('fail')) {
      return {
        success: false,
        message: `Mock directory executor rejected identifier ${identifier}.`,
        raw: {
          mode: 'mock',
          reason: 'simulated_failure',
        },
      };
    }

    switch (payload.kind) {
      case 'user_create':
        return {
          success: true,
          message: `Created mock user ${payload.target.samAccountName}.`,
          changedDn:
            payload.target.distinguishedName ??
            `CN=${payload.target.displayName},${payload.target.ouDistinguishedName ?? defaultUsersOuDn}`,
          changedAttributes: ['cn', 'sAMAccountName', 'displayName'],
          raw: {
            mode: 'mock',
            operation: 'add-user',
          },
        };
      case 'account_change': {
        const attributeChanges =
          payload.changes?.map((change) => change.attribute) ?? [];
        const groupOperations =
          payload.groupChanges?.map((change) => ({
            operation: change.operation,
            group:
              change.group.samAccountName ??
              change.group.displayName ??
              change.group.distinguishedName ??
              'group',
          })) ?? [];

        return {
          success: true,
          message: `Updated ${payload.target.samAccountName} with ${attributeChanges.length} attribute change(s) and ${groupOperations.length} group change(s) in mock directory.`,
          changedDn: payload.target.distinguishedName,
          changedAttributes: [
            ...attributeChanges,
            ...(groupOperations.length > 0 ? ['member'] : []),
          ],
          raw: {
            mode: 'mock',
            operation: 'account-change',
            groupOperations,
          },
        };
      }
      case 'group_change': {
        const memberOperations =
          payload.memberChanges?.map((change) => ({
            operation: change.operation,
            member: change.member.samAccountName,
          })) ?? [];

        return {
          success: true,
          message: `Updated LDAP group ${payload.target.samAccountName} with ${memberOperations.length} member change(s) in mock directory.`,
          changedDn: payload.target.distinguishedName,
          changedAttributes: memberOperations.length > 0 ? ['member'] : [],
          raw: {
            mode: 'mock',
            operation: 'group-change',
            memberOperations,
          },
        };
      }
      case 'account_update':
        return {
          success: true,
          message: `Updated ${payload.target.samAccountName} in mock directory.`,
          changedDn: payload.target.distinguishedName,
          changedAttributes: payload.changes.map((change) => change.attribute),
          raw: {
            mode: 'mock',
            operation: 'modify-user',
          },
        };
      case 'group_membership_add':
        return {
          success: true,
          message: `Added ${payload.member.samAccountName} to ${payload.group.samAccountName ?? payload.group.displayName ?? 'group'}.`,
          changedDn: payload.group.distinguishedName,
          changedAttributes: ['member'],
          raw: {
            mode: 'mock',
            operation: 'group-member-add',
          },
        };
      case 'group_membership_remove':
        return {
          success: true,
          message: `Removed ${payload.member.samAccountName} from ${payload.group.samAccountName ?? payload.group.displayName ?? 'group'}.`,
          changedDn: payload.group.distinguishedName,
          changedAttributes: ['member'],
          raw: {
            mode: 'mock',
            operation: 'group-member-remove',
          },
        };
    }
  }

  private async executeWithLdap(
    context: DirectoryExecutionContext,
  ): Promise<DirectoryExecutionResult> {
    const config = this.sessionService.getRequiredLdapConfig();

    switch (context.payload.kind) {
      case 'user_create':
        return this.executeLdapUserCreate(context.payload, config);
      case 'account_change':
        return this.executeLdapAccountChange(context.payload, config.baseDn);
      case 'group_change':
        return this.executeLdapGroupChange(context.payload, config.baseDn);
      case 'account_update':
        return this.executeLdapAccountUpdate(context.payload, config.baseDn);
      case 'group_membership_add':
      case 'group_membership_remove':
        return this.executeLdapGroupMembership(context.payload, config.baseDn);
    }
  }

  private async executeLdapUserCreate(
    payload: UserCreatePayload,
    config: LdapConnectionConfig,
  ): Promise<DirectoryExecutionResult> {
    const targetDn =
      payload.target.distinguishedName ??
      `CN=${payload.target.displayName},${payload.target.ouDistinguishedName ?? config.usersOuDn}`;

    const attributes: Record<string, string | string[]> = {
      cn: payload.target.displayName,
      sn: payload.target.surname,
      givenName: payload.target.givenName,
      displayName: payload.target.displayName,
      sAMAccountName: payload.target.samAccountName,
      userPrincipalName:
        payload.target.userPrincipalName ??
        (config.upnSuffix
          ? `${payload.target.samAccountName}@${config.upnSuffix}`
          : payload.target.samAccountName),
      objectClass: ['top', 'person', 'organizationalPerson', 'user'],
      userAccountControl: getUserAccountControlValue(false),
    };

    if (payload.target.mail) {
      attributes.mail = payload.target.mail;
    }

    if (payload.target.description) {
      attributes.description = payload.target.description;
    }

    if (payload.target.accountExpiresAt) {
      attributes.accountExpires = isoStringToAccountExpires(
        payload.target.accountExpiresAt,
      );
    }

    const steps: LdapExecutionStep[] = [];
    const changedAttributes = [
      'cn',
      'sn',
      'givenName',
      'displayName',
      'sAMAccountName',
      'userPrincipalName',
      ...(payload.target.mail ? ['mail'] : []),
      ...(payload.target.description ? ['description'] : []),
      ...(payload.target.accountExpiresAt ? ['accountExpiresAt'] : []),
      ...(payload.target.password ? ['password'] : []),
      'enabled',
      ...((payload.initialGroups ?? []).length > 0 ? ['member'] : []),
    ];

    if (
      payload.target.password &&
      !this.sessionService.isPasswordWriteConnectionProtected(config)
    ) {
      return this.buildPasswordTransportFailureResult({
        changedDn: targetDn,
        changedAttributes,
      });
    }

    try {
      const createStep = await this.runLdapWriteStep('create-user', (client) =>
        client.add(targetDn, attributes),
      );
      steps.push({
        name: 'create-user',
        status: 'completed',
        attempts: createStep.attempts,
        detail: {
          distinguishedName: targetDn,
          samAccountName: payload.target.samAccountName,
        },
      });

      const password = payload.target.password;

      if (password) {
        const passwordStep = await this.runLdapWriteStep(
          'set-password',
          (client) =>
            client.modify(
              targetDn,
              this.createReplaceAttributeChange('unicodePwd', [
                encodeUnicodePassword(password),
              ]),
            ),
        );
        steps.push({
          name: 'set-password',
          status: 'completed',
          attempts: passwordStep.attempts,
          detail: {
            distinguishedName: targetDn,
          },
        });
      }

      const enabledStep = await this.runLdapWriteStep(
        'set-enabled-state',
        (client) =>
          client.modify(
            targetDn,
            this.createReplaceAttributeChange('userAccountControl', [
              getUserAccountControlValue(payload.target.enabled ?? true),
            ]),
          ),
      );
      steps.push({
        name: 'set-enabled-state',
        status: 'completed',
        attempts: enabledStep.attempts,
        detail: {
          distinguishedName: targetDn,
          enabled: payload.target.enabled ?? true,
        },
      });

      for (const group of payload.initialGroups ?? []) {
        const groupDn = group.distinguishedName;

        if (!groupDn) {
          continue;
        }

        const label =
          group.samAccountName ?? group.displayName ?? group.distinguishedName;
        const stepName = `add-group:${label}`;
        const groupStep = await this.runLdapWriteStep(stepName, (client) =>
          client.modify(
            groupDn,
            new Change({
              operation: 'add',
              modification: new Attribute({
                type: 'member',
                values: [targetDn],
              }),
            }),
          ),
        );

        steps.push({
          name: stepName,
          status: 'completed',
          attempts: groupStep.attempts,
          detail: {
            groupDn,
            memberDn: targetDn,
          },
        });
      }

      return {
        success: true,
        message: `Created LDAP user ${payload.target.samAccountName}.`,
        changedDn: targetDn,
        changedAttributes,
        raw: {
          mode: 'ldap',
          steps,
          partialChangesPossible: false,
        },
      };
    } catch (error) {
      return this.buildLdapFailureResult({
        operation: `Creating LDAP user ${payload.target.samAccountName}`,
        changedDn: targetDn,
        changedAttributes,
        completedSteps: steps,
        error,
      });
    }
  }

  private async executeLdapAccountUpdate(
    payload: AccountUpdatePayload,
    baseDn: string,
  ): Promise<DirectoryExecutionResult> {
    const steps: LdapExecutionStep[] = [];
    const targetDn =
      payload.target.distinguishedName ??
      (await this.readerService.findDnBySamAccountNameWithFreshClient(
        payload.target.samAccountName,
        baseDn,
      ));
    const changedAttributes = payload.changes.map((change) => change.attribute);

    try {
      const modifyChanges = this.buildAccountAttributeModifyChanges(
        payload.changes,
      );
      const modifyStep = await this.runLdapWriteStep(
        'update-attributes',
        (client) => client.modify(targetDn, modifyChanges),
      );

      steps.push({
        name: 'update-attributes',
        status: 'completed',
        attempts: modifyStep.attempts,
        detail: {
          distinguishedName: targetDn,
          attributes: changedAttributes,
        },
      });

      return {
        success: true,
        message: `Updated LDAP account ${payload.target.samAccountName}.`,
        changedDn: targetDn,
        changedAttributes,
        raw: {
          mode: 'ldap',
          steps,
          partialChangesPossible: false,
        },
      };
    } catch (error) {
      return this.buildLdapFailureResult({
        operation: `Updating LDAP account ${payload.target.samAccountName}`,
        changedDn: targetDn,
        changedAttributes,
        completedSteps: steps,
        error,
      });
    }
  }

  private async executeLdapAccountChange(
    payload: AccountChangePayload,
    baseDn: string,
  ): Promise<DirectoryExecutionResult> {
    const steps: LdapExecutionStep[] = [];
    const targetDn =
      payload.target.distinguishedName ??
      (await this.readerService.findDnBySamAccountNameWithFreshClient(
        payload.target.samAccountName,
        baseDn,
      ));

    const changes = payload.changes ?? [];
    const changedAttributes = [
      ...changes.map((change) => change.attribute),
      ...((payload.groupChanges ?? []).length > 0 ? ['member'] : []),
    ];

    try {
      if (changes.length > 0) {
        const modifyChanges = this.buildAccountAttributeModifyChanges(changes);
        const attributeStep = await this.runLdapWriteStep(
          'update-attributes',
          (client) => client.modify(targetDn, modifyChanges),
        );

        steps.push({
          name: 'update-attributes',
          status: 'completed',
          attempts: attributeStep.attempts,
          detail: {
            distinguishedName: targetDn,
            attributes: changes.map((change) => change.attribute),
          },
        });
      }

      for (const groupChange of payload.groupChanges ?? []) {
        const groupDn =
          groupChange.group.distinguishedName ??
          (await this.readerService.findDnBySamAccountNameWithFreshClient(
            groupChange.group.samAccountName ??
              groupChange.group.displayName ??
              '',
            baseDn,
          ));
        const label =
          groupChange.group.samAccountName ??
          groupChange.group.displayName ??
          groupDn;
        const stepName = `${groupChange.operation}-group:${label}`;
        const groupStep = await this.runLdapWriteStep(stepName, (client) =>
          client.modify(
            groupDn,
            new Change({
              operation: groupChange.operation === 'add' ? 'add' : 'delete',
              modification: new Attribute({
                type: 'member',
                values: [targetDn],
              }),
            }),
          ),
        );

        steps.push({
          name: stepName,
          status: 'completed',
          attempts: groupStep.attempts,
          detail: {
            groupDn,
            memberDn: targetDn,
            operation: groupChange.operation,
          },
        });
      }

      return {
        success: true,
        message: `Updated LDAP account ${payload.target.samAccountName} with ${changes.length} attribute change(s) and ${(payload.groupChanges ?? []).length} group change(s).`,
        changedDn: targetDn,
        changedAttributes,
        raw: {
          mode: 'ldap',
          steps,
          groupOperations: payload.groupChanges ?? [],
          partialChangesPossible: false,
        },
      };
    } catch (error) {
      return this.buildLdapFailureResult({
        operation: `Updating LDAP account ${payload.target.samAccountName}`,
        changedDn: targetDn,
        changedAttributes,
        completedSteps: steps,
        error,
      });
    }
  }

  private async executeLdapGroupChange(
    payload: GroupChangePayload,
    baseDn: string,
  ): Promise<DirectoryExecutionResult> {
    const steps: LdapExecutionStep[] = [];
    const groupDn =
      payload.target.distinguishedName ??
      (await this.readerService.findDnBySamAccountNameWithFreshClient(
        payload.target.samAccountName,
        baseDn,
      ));
    const changedAttributes =
      payload.memberChanges.length > 0 ? ['member'] : [];

    try {
      for (const memberChange of payload.memberChanges) {
        const memberDn =
          memberChange.member.distinguishedName ??
          (await this.readerService.findDnBySamAccountNameWithFreshClient(
            memberChange.member.samAccountName,
            baseDn,
          ));
        const stepName = `${memberChange.operation}-member:${memberChange.member.samAccountName}`;
        const membershipStep = await this.runLdapWriteStep(stepName, (client) =>
          client.modify(
            groupDn,
            new Change({
              operation: memberChange.operation === 'add' ? 'add' : 'delete',
              modification: new Attribute({
                type: 'member',
                values: [memberDn],
              }),
            }),
          ),
        );

        steps.push({
          name: stepName,
          status: 'completed',
          attempts: membershipStep.attempts,
          detail: {
            groupDn,
            memberDn,
            memberSamAccountName: memberChange.member.samAccountName,
            operation: memberChange.operation,
          },
        });
      }

      return {
        success: true,
        message: `Updated LDAP group ${payload.target.samAccountName} with ${payload.memberChanges.length} member change(s).`,
        changedDn: groupDn,
        changedAttributes,
        raw: {
          mode: 'ldap',
          steps,
          memberOperations: payload.memberChanges,
          partialChangesPossible: false,
        },
      };
    } catch (error) {
      return this.buildLdapFailureResult({
        operation: `Updating LDAP group ${payload.target.samAccountName}`,
        changedDn: groupDn,
        changedAttributes,
        completedSteps: steps,
        error,
      });
    }
  }

  private async executeLdapGroupMembership(
    payload: GroupMembershipPayload,
    baseDn: string,
  ): Promise<DirectoryExecutionResult> {
    const steps: LdapExecutionStep[] = [];
    const groupDn =
      payload.group.distinguishedName ??
      (await this.readerService.findDnBySamAccountNameWithFreshClient(
        payload.group.samAccountName ?? payload.group.displayName ?? '',
        baseDn,
      ));
    const memberDn =
      payload.member.distinguishedName ??
      (await this.readerService.findDnBySamAccountNameWithFreshClient(
        payload.member.samAccountName,
        baseDn,
      ));

    const stepName =
      payload.kind === 'group_membership_add'
        ? `add-group:${payload.group.samAccountName ?? payload.group.displayName ?? groupDn}`
        : `remove-group:${payload.group.samAccountName ?? payload.group.displayName ?? groupDn}`;

    try {
      const membershipStep = await this.runLdapWriteStep(stepName, (client) =>
        client.modify(
          groupDn,
          new Change({
            operation:
              payload.kind === 'group_membership_add' ? 'add' : 'delete',
            modification: new Attribute({
              type: 'member',
              values: [memberDn],
            }),
          }),
        ),
      );

      steps.push({
        name: stepName,
        status: 'completed',
        attempts: membershipStep.attempts,
        detail: {
          groupDn,
          memberDn,
        },
      });

      return {
        success: true,
        message:
          payload.kind === 'group_membership_add'
            ? `Added ${payload.member.samAccountName} to LDAP group.`
            : `Removed ${payload.member.samAccountName} from LDAP group.`,
        changedDn: groupDn,
        changedAttributes: ['member'],
        raw: {
          mode: 'ldap',
          steps,
          partialChangesPossible: false,
        },
      };
    } catch (error) {
      return this.buildLdapFailureResult({
        operation:
          payload.kind === 'group_membership_add'
            ? `Adding ${payload.member.samAccountName} to LDAP group`
            : `Removing ${payload.member.samAccountName} from LDAP group`,
        changedDn: groupDn,
        changedAttributes: ['member'],
        completedSteps: steps,
        error,
      });
    }
  }

  private async runLdapWriteStep<T>(
    stepName: string,
    operation: (client: Client, config: LdapConnectionConfig) => Promise<T>,
  ): Promise<{ attempts: number; value: T }> {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const value = await this.sessionService.withBoundClient(operation);
        return { attempts: attempt, value };
      } catch (error) {
        const shouldRetry =
          attempt < maxAttempts && isRetryableLdapSocketError(error);

        if (shouldRetry) {
          continue;
        }

        throw new LdapStepError(stepName, attempt, error);
      }
    }

    throw new LdapStepError(stepName, maxAttempts, 'LDAP step failed.');
  }

  private buildPasswordTransportFailureResult({
    changedDn,
    changedAttributes,
  }: {
    changedDn: string;
    changedAttributes: string[];
  }): DirectoryExecutionResult {
    const message =
      'Active Directory password creation requires a protected LDAP connection. Configure LDAP_URL to use ldaps:// on port 636, or set LDAP_START_TLS=true with a domain controller certificate that supports StartTLS. Refusing to create the user before password setup to avoid partial AD changes.';
    const failedStep: LdapExecutionStep = {
      name: 'password-transport-preflight',
      status: 'failed',
      attempts: 1,
      detail: {
        error: message,
      },
    };

    return {
      success: false,
      message,
      changedDn,
      changedAttributes,
      raw: {
        mode: 'ldap',
        steps: [failedStep],
        failedStep,
        ldapErrorMessage: message,
        partialChangesPossible: false,
      },
    };
  }

  private buildLdapFailureResult({
    operation,
    changedDn,
    changedAttributes,
    completedSteps,
    error,
  }: {
    operation: string;
    changedDn?: string;
    changedAttributes: string[];
    completedSteps: LdapExecutionStep[];
    error: unknown;
  }): DirectoryExecutionResult {
    const stepError =
      error instanceof LdapStepError
        ? error
        : new LdapStepError('directory-operation', 1, error);
    const rawErrorMessage = getRawErrorMessage(stepError.cause);
    const failedStep: LdapExecutionStep = {
      name: stepError.stepName,
      status: 'failed',
      attempts: stepError.attempts,
      detail: {
        error: rawErrorMessage,
      },
    };

    return {
      success: false,
      message: `${operation} failed during ${stepError.stepName}. ${rawErrorMessage}`,
      changedDn,
      changedAttributes,
      raw: {
        mode: 'ldap',
        steps: [...completedSteps, failedStep],
        failedStep,
        ldapErrorMessage: rawErrorMessage,
        partialChangesPossible:
          completedSteps.length > 0 ||
          isRetryableLdapSocketError(stepError.cause),
      },
    };
  }

  private buildAccountAttributeModifyChanges(
    changes: Array<{
      attribute: string;
      nextValue: string | null;
    }>,
  ): Change[] {
    return changes.map((change) => {
      switch (change.attribute) {
        case 'enabled':
        case 'userAccountControl':
          return this.createReplaceAttributeChange('userAccountControl', [
            getUserAccountControlValue(parseEnabledValue(change.nextValue)),
          ]);
        case 'accountExpiresAt':
        case 'accountExpires':
          return this.createReplaceAttributeChange('accountExpires', [
            isoStringToAccountExpires(change.nextValue),
          ]);
        default:
          return this.createReplaceAttributeChange(
            change.attribute,
            change.nextValue === null ? [] : [change.nextValue],
          );
      }
    });
  }

  private createReplaceAttributeChange(
    type: string,
    values: Buffer[] | string[],
  ): Change {
    return new Change({
      operation: 'replace',
      modification: new Attribute({
        type,
        values,
      }),
    });
  }
}
