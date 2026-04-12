export const ELASTIC_WINLOGBEAT_DRIVER_KEY = 'elastic-winlogbeat';

export const DEFAULT_SIEM_EVENT_IDS = [
  4720, 4722, 4723, 4724, 4725, 4726, 4728, 4729, 4732, 4733, 4738, 4740,
  4756, 4757, 4767, 4781, 5136, 5137,
] as const;

export const ACCOUNT_ATTRIBUTE_EVENT_IDS = new Set<number>([
  4722, 4725, 4738, 4781, 5136,
]);
export const GROUP_ADD_EVENT_IDS = new Set<number>([4728, 4732, 4756]);
export const GROUP_REMOVE_EVENT_IDS = new Set<number>([4729, 4733, 4757]);

export const EVENT_TYPE_BY_ID: Record<number, string> = {
  4720: 'user_create',
  4722: 'account_enable',
  4723: 'password_change',
  4724: 'password_reset',
  4725: 'account_disable',
  4726: 'user_delete',
  4728: 'group_membership_add',
  4729: 'group_membership_remove',
  4732: 'group_membership_add',
  4733: 'group_membership_remove',
  4738: 'account_update',
  4740: 'account_lockout',
  4756: 'group_membership_add',
  4757: 'group_membership_remove',
  4767: 'account_unlock',
  4781: 'account_rename',
  5136: 'account_update',
  5137: 'user_create',
};

export const EVENT_TITLE_BY_ID: Record<number, string> = {
  4720: 'User account created',
  4722: 'User account enabled',
  4723: 'User password change attempted',
  4724: 'User password reset attempted',
  4725: 'User account disabled',
  4726: 'User account deleted',
  4728: 'User added to group',
  4729: 'User removed from group',
  4732: 'User added to local group',
  4733: 'User removed from local group',
  4738: 'User account changed',
  4740: 'User account locked out',
  4756: 'User added to universal group',
  4757: 'User removed from universal group',
  4767: 'User account unlocked',
  4781: 'User account renamed',
  5136: 'Directory object modified',
  5137: 'Directory object created',
};
