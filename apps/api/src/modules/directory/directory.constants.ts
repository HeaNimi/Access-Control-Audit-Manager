export const USER_ATTRIBUTES = [
  'distinguishedName',
  'sAMAccountName',
  'displayName',
  'givenName',
  'sn',
  'mail',
  'userPrincipalName',
  'objectGUID',
  'objectSid',
  'department',
  'title',
  'company',
  'telephoneNumber',
  'description',
  'accountExpires',
  'userAccountControl',
  'memberOf',
  'primaryGroupID',
];

export const USER_SEARCH_ATTRIBUTES = [
  'distinguishedName',
  'sAMAccountName',
  'displayName',
  'userPrincipalName',
  'mail',
  'objectGUID',
];

export const GROUP_ATTRIBUTES = [
  'distinguishedName',
  'sAMAccountName',
  'displayName',
  'description',
  'cn',
  'objectGUID',
];

export const GROUP_DETAIL_ATTRIBUTES = [...GROUP_ATTRIBUTES, 'member'];

export const MEMBER_ATTRIBUTES = [
  'distinguishedName',
  'sAMAccountName',
  'displayName',
  'objectGUID',
  'objectClass',
  'cn',
];
