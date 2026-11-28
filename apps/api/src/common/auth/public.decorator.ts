import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@etkinlik/shared';
import type { Request } from 'express';
import { UnauthenticatedError } from '../errors.js';
import type { AuthContext } from './auth-context.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';

/** Reachable without a session (health, login, webhooks). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Roles allowed to call the route. Authorization is deny-by-default: a route
 * with neither @Public() nor @Roles(...) answers 403 to every caller.
 */
export const Roles = (...roles: [Role, ...Role[]]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated caller; the student id always comes from the session, never the request. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const auth = context.switchToHttp().getRequest<Request>().auth;
  if (auth === undefined) {
    throw new UnauthenticatedError('Bu işlem için giriş yapmalısınız.');
  }
  return auth satisfies AuthContext;
});
