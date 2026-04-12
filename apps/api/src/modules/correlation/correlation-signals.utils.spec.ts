import type {
  AccountChangePayload,
  ChangeRequestPayload,
  GroupChangePayload,
  UserCreatePayload,
} from '@acam-ts/contracts';
import type {
  ChangeRequestRow,
  ObservedEventRow,
} from '../../common/database/schema';

import {
  collectMatchedCorrelationSignals,
  doesObservedEventMatchRequest,
  getCorrelationSignalForEvent,
  getCorrelationSignalsForEvent,
  getExpectedCorrelationSignals,
  getExpectedEventIds,
} from './correlation-signals.utils';

describe('correlation-signals.utils', () => {
  const baseRequest = {
    request_type: 'account_change',
    target_object_guid: null,
    target_object_sid: 'S-1-5-21-4013827353-799469157-2647928806-1126',
    target_distinguished_name:
      'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
    target_sam_account_name: 'helper.james',
  } as ChangeRequestRow;

  function event(
    overrides: Partial<ObservedEventRow>,
    eventData: Record<string, unknown> = {},
  ): ObservedEventRow {
    return {
      observed_event_id: 1,
      event_source: 'active_directory',
      source_system: 'elastic-winlogbeat',
      source_reference: 'winlogbeat:event-1',
      event_id: null,
      event_time: new Date('2026-04-10T10:00:00.000Z'),
      event_type: null,
      title: null,
      message: null,
      object_guid: null,
      distinguished_name: null,
      sam_account_name: null,
      subject_account_name: null,
      payload: {
        raw: {
          winlog: {
            event_data: eventData,
          },
        },
      },
      created_at: new Date('2026-04-10T10:00:00.000Z'),
      ...overrides,
    };
  }

  it('expects create, enable, and initial-group signals for user creation by default', () => {
    const payload: UserCreatePayload = {
      kind: 'user_create',
      target: {
        samAccountName: 'helper.james',
        displayName: 'helper james',
        givenName: 'helper',
        surname: 'james',
      },
      initialGroups: [
        {
          distinguishedName:
            'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
          samAccountName: 'Helpdesk',
        },
      ],
    };

    expect(getExpectedEventIds('user_create', payload)).toEqual([
      4720, 5137, 4722, 4738, 5136, 4728, 4732, 4756,
    ]);
    expect(getExpectedCorrelationSignals(payload)).toEqual([
      'user.create',
      'account.enable',
      'group.add:cn=helpdesk,ou=groups,ou=managedobjects,dc=example,dc=local',
    ]);
  });

  it('does not require an enable signal when a new user is created disabled', () => {
    const payload: UserCreatePayload = {
      kind: 'user_create',
      target: {
        samAccountName: 'helper.james',
        displayName: 'helper james',
        givenName: 'helper',
        surname: 'james',
        enabled: false,
      },
      initialGroups: [
        {
          samAccountName: 'Helpdesk',
        },
      ],
    };

    expect(getExpectedCorrelationSignals(payload)).toEqual([
      'user.create',
      'group.add:helpdesk',
    ]);
  });

  it('matches disable and group-remove signals for account changes', () => {
    const payload: AccountChangePayload = {
      kind: 'account_change',
      target: {
        samAccountName: 'helper.james',
        objectSid: baseRequest.target_object_sid,
      },
      changes: [
        {
          attribute: 'enabled',
          previousValue: 'true',
          nextValue: 'false',
        },
      ],
      groupChanges: [
        {
          operation: 'remove',
          group: {
            distinguishedName:
              'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
            samAccountName: 'Helpdesk',
          },
        },
      ],
    };
    const disableObserved = event(
      {
        event_id: 4725,
        event_type: 'account_disable',
        distinguished_name:
          'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        sam_account_name: 'helper.james',
      },
      {
        TargetUserName: 'helper.james',
        TargetSid: baseRequest.target_object_sid,
      },
    );
    const removeObserved = event(
      {
        observed_event_id: 2,
        source_reference: 'winlogbeat:event-2',
        event_id: 4729,
        distinguished_name:
          'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
        sam_account_name: 'Helpdesk',
        subject_account_name: 'helper.james',
      },
      {
        TargetUserName: 'Helpdesk',
        TargetSid: 'S-1-5-32-544',
        MemberName:
          'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        MemberSid: baseRequest.target_object_sid,
      },
    );

    expect(getCorrelationSignalForEvent(disableObserved, baseRequest, payload)).toBe(
      'account.disable',
    );
    expect(
      getCorrelationSignalForEvent(removeObserved, baseRequest, payload),
    ).toBe(
      'group.remove:cn=helpdesk,ou=groups,ou=managedobjects,dc=example,dc=local',
    );
    expect(
      doesObservedEventMatchRequest(disableObserved, baseRequest, payload),
    ).toBe(true);
    expect(
      doesObservedEventMatchRequest(removeObserved, baseRequest, payload),
    ).toBe(true);
  });

  it('aggregates grouped 5136 events that share ObjectDN and OpCorrelationID', () => {
    const payload: AccountChangePayload = {
      kind: 'account_change',
      target: {
        samAccountName: 'helper.james',
        objectSid: baseRequest.target_object_sid,
      },
      changes: [
        {
          attribute: 'description',
          previousValue: 'old',
          nextValue: 'new',
        },
        {
          attribute: 'department',
          previousValue: 'support',
          nextValue: 'security',
        },
        {
          attribute: 'accountExpiresAt',
          previousValue: null,
          nextValue: '2026-05-01T00:00:00.000Z',
        },
      ],
    };
    const sharedEventData = {
      ObjectDN:
        'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
      ObjectGUID: '{27136163-7018-4bd9-a8ea-9aaefdee7a8b}',
      TargetSid: baseRequest.target_object_sid,
      OpCorrelationID: '{f450107c-eafe-4faf-ac9c-bfba3ff69f23}',
    };
    const events = [
      event(
        {
          observed_event_id: 10,
          source_reference: 'winlogbeat:event-10',
          event_id: 5136,
          event_type: 'account_update',
          distinguished_name:
            'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        },
        {
          ...sharedEventData,
          AttributeLDAPDisplayName: 'description',
          AttributeValue: 'new',
        },
      ),
      event(
        {
          observed_event_id: 11,
          source_reference: 'winlogbeat:event-11',
          event_id: 5136,
          event_type: 'account_update',
          distinguished_name:
            'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        },
        {
          ...sharedEventData,
          AttributeLDAPDisplayName: 'department',
          AttributeValue: 'security',
        },
      ),
      event(
        {
          observed_event_id: 12,
          source_reference: 'winlogbeat:event-12',
          event_id: 5136,
          event_type: 'account_update',
          distinguished_name:
            'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        },
        {
          ...sharedEventData,
          AttributeLDAPDisplayName: 'accountExpires',
          AttributeValue: '133595328000000000',
        },
      ),
    ];

    expect(
      collectMatchedCorrelationSignals(events, baseRequest, payload),
    ).toEqual([
      'account.attr:description',
      'account.attr:department',
      'account.attr:accountExpires',
    ]);
  });

  it('matches rename requests against 4781 old and new account names', () => {
    const payload: AccountChangePayload = {
      kind: 'account_change',
      target: {
        samAccountName: 'helper.james',
        objectSid: baseRequest.target_object_sid,
      },
      changes: [
        {
          attribute: 'sAMAccountName',
          previousValue: 'helper.james',
          nextValue: 'helper.renamed',
        },
      ],
    };
    const observed = event(
      {
        event_id: 4781,
        event_type: 'account_rename',
      },
      {
        TargetSid: baseRequest.target_object_sid,
        OldTargetUserName: 'helper.james',
        NewTargetUserName: 'helper.renamed',
      },
    );

    expect(getCorrelationSignalsForEvent(observed, baseRequest, payload)).toEqual([
      'account.rename',
    ]);
    expect(doesObservedEventMatchRequest(observed, baseRequest, payload)).toBe(
      true,
    );
  });

  it('uses 4738 as a fallback for display-name and UAC-based changes', () => {
    const payload: AccountChangePayload = {
      kind: 'account_change',
      target: {
        samAccountName: 'helper.james',
        objectSid: baseRequest.target_object_sid,
      },
      changes: [
        {
          attribute: 'displayName',
          previousValue: 'Helper James',
          nextValue: 'Helper J.',
        },
        {
          attribute: 'enabled',
          previousValue: 'true',
          nextValue: 'false',
        },
      ],
    };
    const observed = event(
      {
        event_id: 4738,
        event_type: 'account_update',
        sam_account_name: 'helper.james',
      },
      {
        TargetUserName: 'helper.james',
        TargetSid: baseRequest.target_object_sid,
        DisplayName: 'Helper J.',
        OldUacValue: '0x200',
        NewUacValue: '0x202',
      },
    );

    expect(getCorrelationSignalsForEvent(observed, baseRequest, payload)).toEqual([
      'account.attr:displayName',
      'account.disable',
    ]);
  });

  it('filters expected signals to completed execution steps when execution data exists', () => {
    const payload: AccountChangePayload = {
      kind: 'account_change',
      target: {
        samAccountName: 'helper.james',
        objectSid: baseRequest.target_object_sid,
      },
      changes: [
        {
          attribute: 'description',
          previousValue: 'old',
          nextValue: 'new',
        },
      ],
      groupChanges: [
        {
          operation: 'remove',
          group: {
            distinguishedName:
              'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
            samAccountName: 'Helpdesk',
          },
        },
      ],
    };
    const executionResult = {
      mode: 'ldap',
      steps: [
        {
          name: 'update-attributes',
          status: 'completed',
          detail: {
            distinguishedName:
              'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
            attributes: ['description'],
          },
        },
        {
          name: 'remove-group:Helpdesk',
          status: 'failed',
          detail: {
            groupDn:
              'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
            memberDn:
              'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
            operation: 'remove',
          },
        },
      ],
    };

    expect(getExpectedCorrelationSignals(payload, executionResult)).toEqual([
      'account.attr:description',
    ]);
  });

  it('matches group-change member remove signals by group target and member', () => {
    const request = {
      ...baseRequest,
      request_type: 'group_change',
      target_distinguished_name:
        'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
      target_sam_account_name: 'Helpdesk',
      target_object_sid: 'S-1-5-32-544',
    } as ChangeRequestRow;
    const payload: GroupChangePayload = {
      kind: 'group_change',
      target: { samAccountName: 'Helpdesk' },
      memberChanges: [
        {
          operation: 'remove',
          member: {
            samAccountName: 'helper.james',
            objectSid: baseRequest.target_object_sid,
          },
        },
      ],
    };
    const observed = event(
      {
        event_id: 4729,
        distinguished_name:
          'CN=Helpdesk,OU=Groups,OU=ManagedObjects,DC=example,DC=local',
        sam_account_name: 'Helpdesk',
        subject_account_name: 'helper.james',
      },
      {
        TargetUserName: 'Helpdesk',
        TargetSid: 'S-1-5-32-544',
        MemberName:
          'CN=helper james,OU=Users,OU=ManagedObjects,DC=example,DC=local',
        MemberSid: baseRequest.target_object_sid,
      },
    );

    expect(getCorrelationSignalForEvent(observed, request, payload)).toBe(
      'member.remove:S-1-5-21-4013827353-799469157-2647928806-1126',
    );
    expect(doesObservedEventMatchRequest(observed, request, payload)).toBe(
      true,
    );
  });
});
