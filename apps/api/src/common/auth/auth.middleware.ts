import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { AuthService } from '../../modules/auth/auth.service';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authorization = req.header('authorization');

    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length);

      try {
        req.user = await this.authService.getUserFromAccessToken(token);
      } catch {
        req.user = undefined;
      }
    }

    next();
  }
}
