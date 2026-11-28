import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../../infra/redis.js';

export const LOGIN_STATE_COOKIE = '__Host-login-state';
export const LOGIN_STATE_TTL_SECONDS = 600;

const loginStateSchema = z.object({
  state: z.string().min(16).max(256),
  codeVerifier: z.string().min(43).max(128),
  nonce: z.string().min(16).max(256),
  returnTo: z.string().max(500),
});
export type LoginState = z.infer<typeof loginStateSchema>;

const key = (loginId: string) => `login-attempt:${loginId}`;

/**
 * One-time OIDC login attempt (expected state, PKCE verifier, nonce, return path),
 * keyed by a random id held in this browser's __Host-login-state cookie.
 */
@Injectable()
export class LoginStateStore {
  constructor(private readonly redis: RedisService) {}

  async save(loginId: string, value: LoginState): Promise<void> {
    await this.redis.client.set(key(loginId), JSON.stringify(value), 'EX', LOGIN_STATE_TTL_SECONDS);
  }

  /** Atomically reads and deletes, so a state value can be used only once. */
  async consume(loginId: string): Promise<LoginState | undefined> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(loginId)) {
      return undefined;
    }
    const raw = await this.redis.client.getdel(key(loginId));
    if (raw === null) {
      return undefined;
    }
    const parsed = loginStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  }
}
