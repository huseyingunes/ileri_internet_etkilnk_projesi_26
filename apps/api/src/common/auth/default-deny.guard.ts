import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthenticatedError } from '../errors.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

/**
 * Global guard: authorization is denied by default. Routes must opt out with
 * @Public(); Phase 3 replaces the fallback with session + role checks.
 */
@Injectable()
export class DefaultDenyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }
    throw new UnauthenticatedError('Bu işlem için giriş yapmalısınız.');
  }
}
