import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { RoleCode } from '@acam-ts/contracts';

import { ROLES_METADATA_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<RoleCode[]>(ROLES_METADATA_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const roles = request.user?.roles ?? [];

    const hasRole = requiredRoles.some((role) => roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('You do not have the required role.');
    }

    return true;
  }
}
