import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { RedisService } from '../../infra/redis.js';

export const LOGIN_STATE_COOKIE = '__Host-login-state';
export const LOGIN_STATE_TTL_SECONDS = 600;

const loginStateSchema = z.object({
  codeVerifier: z.string().min(43).max(128),
  nonce: z.string().min(16).max(256),
  returnTo: z.string().max(500),
});
export type LoginState = z.infer<typeof loginStateSchema>;

const key = (state: string) => `login-state:${state}`;

/** One-time OIDC login state (PKCE verifier, nonce, return path), consumed on callback. */
@Injectable()
export class LoginStateStore {
  constructor(private readonly redis: RedisService) {}

  async save(state: string, value: LoginState): Promise<void> {
    await this.redis.client.set(key(state), JSON.stringify(value), 'EX', LOGIN_STATE_TTL_SECONDS);
  }

  /** Atomically reads and deletes, so a state value can be used only once. */
  async consume(state: string): Promise<LoginState | undefined> {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(state)) {
      return undefined;
    }
    const raw = await this.redis.client.getdel(key(state));
    if (raw === null) {
      return undefined;
    }
    const parsed = loginStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  }
}
