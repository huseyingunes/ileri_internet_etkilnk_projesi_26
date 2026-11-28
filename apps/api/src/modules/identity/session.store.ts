import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Temporal } from '@etkinlik/shared';
import { z } from 'zod';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { RedisService } from '../../infra/redis.js';

export const SESSION_COOKIE = '__Host-session';
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const sessionSchema = z.object({
  userId: z.string().regex(/^[0-9]+$/),
  absoluteExpiresAt: z.number().int().positive(),
});

/** Redis keys hold only a SHA-256 digest of the token, so a Redis dump cannot be replayed. */
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const sessionKey = (hash: string) => `session:${hash}`;
const userSessionsKey = (userId: bigint) => `user-sessions:${userId.toString()}`;
const nowMs = () => Temporal.Now.instant().epochMilliseconds;

/**
 * Server-side sessions. A fresh random id is issued on every login (no session
 * fixation); sessions expire after SESSION_IDLE_SECONDS of inactivity and
 * SESSION_ABSOLUTE_SECONDS in total.
 */
@Injectable()
export class SessionStore {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly redis: RedisService,
  ) {}

  async create(userId: bigint): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const hash = digest(token);
    const absoluteExpiresAt = nowMs() + this.env.SESSION_ABSOLUTE_SECONDS * 1000;
    await this.redis.client
      .multi()
      .set(
        sessionKey(hash),
        JSON.stringify({ userId: userId.toString(), absoluteExpiresAt }),
        'EX',
        this.env.SESSION_IDLE_SECONDS,
      )
      .sadd(userSessionsKey(userId), hash)
      .expire(userSessionsKey(userId), this.env.SESSION_ABSOLUTE_SECONDS)
      .exec();
    return token;
  }

  /** Resolves a token and slides its idle expiry, never past the absolute limit. */
  async resolve(token: string): Promise<{ userId: bigint } | undefined> {
    if (!TOKEN_FORMAT.test(token)) {
      return undefined;
    }
    const key = sessionKey(digest(token));
    const raw = await this.redis.client.get(key);
    if (raw === null) {
      return undefined;
    }
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      await this.redis.client.del(key);
      return undefined;
    }
    const remainingSeconds = Math.floor((parsed.data.absoluteExpiresAt - nowMs()) / 1000);
    if (remainingSeconds <= 0) {
      await this.redis.client.del(key);
      return undefined;
    }
    await this.redis.client.expire(key, Math.min(this.env.SESSION_IDLE_SECONDS, remainingSeconds));
    return { userId: BigInt(parsed.data.userId) };
  }

  async destroy(token: string): Promise<void> {
    if (TOKEN_FORMAT.test(token)) {
      await this.redis.client.del(sessionKey(digest(token)));
    }
  }

  /** Ends every session of a user (deactivation, role change, data deletion). */
  async destroyAllForUser(userId: bigint): Promise<void> {
    const hashes = await this.redis.client.smembers(userSessionsKey(userId));
    const pipeline = this.redis.client.multi();
    for (const hash of hashes) {
      pipeline.del(sessionKey(hash));
    }
    pipeline.del(userSessionsKey(userId));
    await pipeline.exec();
  }
}
