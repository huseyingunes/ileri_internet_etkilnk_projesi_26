import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Temporal } from '@etkinlik/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../infra/redis.js';
import { RateLimitedError } from '../errors.js';

export const RATE_LIMIT_KEY = 'rate-limit:policy';

/** Limits are validated: zero, empty or negative values are rejected at start-up. */
const policySchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  limit: z.number().int().positive().max(10_000),
  windowSeconds: z.number().int().positive().max(86_400),
  by: z.enum(['ip', 'user']),
});
export type RateLimitPolicy = z.infer<typeof policySchema>;

export const RateLimit = (policy: RateLimitPolicy) =>
  SetMetadata(RATE_LIMIT_KEY, policySchema.parse(policy));

export interface WindowState {
  count: number;
  resetSeconds: number;
}

/** Fixed window: which window an instant falls in and how long until it resets. */
export function windowOf(
  nowSeconds: number,
  windowSeconds: number,
): { index: number; resetSeconds: number } {
  const index = Math.floor(nowSeconds / windowSeconds);
  return { index, resetSeconds: (index + 1) * windowSeconds - nowSeconds };
}

/**
 * Redis-backed fixed-window rate limiting (runs after AuthGuard so per-user
 * limits use the session's user id, never a client-supplied one).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy === undefined) {
      return true;
    }
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const subject =
      policy.by === 'user' && request.auth !== undefined
        ? `u:${request.auth.userId.toString()}`
        : `ip:${request.ip ?? 'unknown'}`;

    const nowSeconds = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
    const window = windowOf(nowSeconds, policy.windowSeconds);
    const key = `rate-limit:${policy.name}:${subject}:${window.index.toString()}`;
    const results = await this.redis.client
      .multi()
      .incr(key)
      .expire(key, policy.windowSeconds)
      .exec();
    const counted = results?.[0]?.[1];
    const count = typeof counted === 'number' ? counted : policy.limit + 1;

    response.setHeader('RateLimit-Limit', String(policy.limit));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, policy.limit - count)));
    response.setHeader('RateLimit-Reset', String(window.resetSeconds));
    if (count > policy.limit) {
      throw new RateLimitedError(
        'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
        Math.max(1, window.resetSeconds),
      );
    }
    return true;
  }
}
