import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AuthProvider } from '@acam-ts/contracts';

export interface AccessTokenPayload {
  sub: string;
  username: string;
  authProvider: AuthProvider;
  iat: number;
  exp: number;
}

interface JwtHeader {
  alg: 'HS256';
  typ: 'JWT';
}

@Injectable()
export class AuthTokenService {
  constructor(private readonly configService: ConfigService) {}

  issueToken(input: {
    userId: string;
    username: string;
    authProvider: AuthProvider;
  }): string {
    const secret = this.getRequiredSecret();
    const issuedAt = Math.floor(Date.now() / 1000);
    const ttlSeconds = this.getTtlSeconds();
    const payload: AccessTokenPayload = {
      sub: input.userId,
      username: input.username,
      authProvider: input.authProvider,
      iat: issuedAt,
      exp: issuedAt + ttlSeconds,
    };

    return this.signToken(payload, secret);
  }

  verifyToken(token: string): AccessTokenPayload {
    const secret = this.getRequiredSecret();
    const segments = token.split('.');

    if (segments.length !== 3) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const expectedSignature = this.sign(
      `${encodedHeader}.${encodedPayload}`,
      secret,
    );

    if (!this.safeEquals(encodedSignature, expectedSignature)) {
      throw new UnauthorizedException('Invalid access token signature.');
    }

    const header = this.parseJson<JwtHeader>(
      encodedHeader,
      'access token header',
    );

    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new UnauthorizedException('Unsupported access token format.');
    }

    const payload = this.parseJson<AccessTokenPayload>(
      encodedPayload,
      'access token payload',
    );

    if (
      !payload.sub ||
      !payload.username ||
      !payload.authProvider ||
      !Number.isFinite(payload.exp)
    ) {
      throw new UnauthorizedException('Invalid access token payload.');
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Access token has expired.');
    }

    return payload;
  }

  private signToken(payload: AccessTokenPayload, secret: string): string {
    const encodedHeader = this.encodeJson({
      alg: 'HS256',
      typ: 'JWT',
    } satisfies JwtHeader);
    const encodedPayload = this.encodeJson(payload);
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`, secret);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  private sign(value: string, secret: string): string {
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private encodeJson(value: object): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

  private parseJson<T>(value: string, label: string): T {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException(`Could not parse ${label}.`);
    }
  }

  private safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private getRequiredSecret(): string {
    const secret = this.configService.get<string>('AUTH_JWT_SECRET');

    if (!secret || secret === 'change-me-jwt-secret') {
      throw new InternalServerErrorException(
        'AUTH_JWT_SECRET must be configured for authentication.',
      );
    }

    return secret;
  }

  private getTtlSeconds(): number {
    const configured = Number(
      this.configService.get<string>('AUTH_JWT_TTL_SECONDS') ?? '28800',
    );

    return Number.isFinite(configured) && configured > 0 ? configured : 28800;
  }
}
