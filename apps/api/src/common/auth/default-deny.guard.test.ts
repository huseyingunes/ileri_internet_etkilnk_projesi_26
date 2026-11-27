import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { UnauthenticatedError } from '../errors.js';
import { DefaultDenyGuard } from './default-deny.guard.js';
import { Public } from './public.decorator.js';

class Routes {
  @Public()
  open(): void {}

  closed(): void {}
}

function contextFor(handler: () => void): ExecutionContext {
  return { getHandler: () => handler, getClass: () => Routes } as unknown as ExecutionContext;
}

describe('DefaultDenyGuard', () => {
  const guard = new DefaultDenyGuard(new Reflector());

  it('allows routes explicitly marked @Public()', () => {
    expect(guard.canActivate(contextFor(Routes.prototype.open))).toBe(true);
  });

  it('denies every other route with 401', () => {
    expect(() => guard.canActivate(contextFor(Routes.prototype.closed))).toThrow(
      UnauthenticatedError,
    );
  });
});
