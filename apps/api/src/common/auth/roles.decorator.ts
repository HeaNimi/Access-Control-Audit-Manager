import { SetMetadata } from '@nestjs/common';

import type { RoleCode } from '@acam-ts/contracts';

export const ROLES_METADATA_KEY = 'roles';
export const Roles = (...roles: RoleCode[]) =>
  SetMetadata(ROLES_METADATA_KEY, roles);
