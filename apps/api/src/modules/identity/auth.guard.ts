import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@etkinlik/shared';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../common/auth/public.decorator.js';
import { ForbiddenError, UnauthenticatedError } from '../../common/errors.js';
import { readCookie } from '../../common/http/cookies.js';
import { SESSION_COOKIE, SessionStore } from './session.store.js';
import { UsersService } from './users.service.js';

/**
 * Central authorization (deny by default):
 *  - @Public() routes pass;
 *  - otherwise a valid session of an active user is required (401);
 *  - and the user's role must be listed in @Roles(...) (403). A route without
 *    @Roles(...) is forbidden for everyone.
 * Roles are read from the database on every request, so changes apply at once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionStore,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = readCookie(request, SESSION_COOKIE);
    const session = token === undefined ? undefined : await this.sessions.resolve(token);
    const user = session === undefined ? undefined : await this.users.findActive(session.userId);
    if (token === undefined || user === undefined) {
      if (token !== undefined) await this.sessions.destroy(token);
      throw new UnauthenticatedError('Bu işlem için giriş yapmalısınız.');
    }
    request.auth = {
      userId: user.id,
      publicId: user.publicId,
      role: user.role,
      sessionToken: token,
    };

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.includes(user.role) !== true) {
      throw new ForbiddenError('Bu işlem için yetkiniz yok.');
    }
    return true;
  }
}
