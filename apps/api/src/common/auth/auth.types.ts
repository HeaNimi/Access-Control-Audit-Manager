import type { AuthenticatedUserProfile } from '@acam-ts/contracts';

export type AuthenticatedUser = AuthenticatedUserProfile;

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
