import { Inject, Injectable } from '@nestjs/common';
import { roleSchema } from '@etkinlik/shared';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';

/** ID token claims this application relies on (Keycloak realm "etkinlik"). */
export const identityClaimsSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.email().transform((value) => value.toLowerCase()),
  email_verified: z.literal(true),
  name: z.string().min(1).max(120).optional(),
  given_name: z.string().max(60).optional(),
  family_name: z.string().max(60).optional(),
  etkinlik_role: roleSchema.optional(),
  student_number: z
    .string()
    .regex(/^[0-9A-Za-z]{4,20}$/)
    .optional(),
});
export type IdentityClaims = z.infer<typeof identityClaimsSchema>;

export interface AuthorizationRequest {
  url: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}

/**
 * OpenID Connect relying party (authorization code + PKCE S256, state and
 * nonce). Back-channel requests to the IdP can be routed over the private
 * network while the issuer stays the public URL that appears in tokens.
 */
@Injectable()
export class OidcService {
  private configuration: Promise<oidc.Configuration> | undefined;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get redirectUri(): string {
    return `${this.env.APP_ORIGIN}/api/v1/auth/callback`;
  }

  private readonly backChannelFetch: oidc.CustomFetch = (url, options) => {
    const internal = this.env.OIDC_INTERNAL_ISSUER;
    const target =
      internal !== undefined && url.startsWith(this.env.OIDC_ISSUER)
        ? internal + url.slice(this.env.OIDC_ISSUER.length)
        : url;
    return fetch(target, {
      method: options.method,
      headers: options.headers,
      body: options.body ?? null,
      redirect: options.redirect,
      signal: AbortSignal.timeout(this.env.EXTERNAL_CALL_TIMEOUT_MS),
    });
  };

  private async discover(): Promise<oidc.Configuration> {
    const config = await oidc.discovery(
      new URL(this.env.OIDC_ISSUER),
      this.env.OIDC_CLIENT_ID,
      this.env.OIDC_CLIENT_SECRET,
      undefined,
      {
        [oidc.customFetch]: this.backChannelFetch,
        ...(this.env.OIDC_ALLOW_INSECURE_HTTP
          ? // eslint-disable-next-line @typescript-eslint/no-deprecated -- test-only; refused in production by envSchema.
            { execute: [oidc.allowInsecureRequests] }
          : {}),
      },
    );
    config[oidc.customFetch] = this.backChannelFetch;
    return config;
  }

  private config(): Promise<oidc.Configuration> {
    if (this.configuration === undefined) {
      const pending = this.discover();
      this.configuration = pending;
      // Retry discovery on the next login if the IdP was unreachable.
      pending.catch(() => {
        if (this.configuration === pending) this.configuration = undefined;
      });
    }
    return this.configuration;
  }

  async createAuthorizationRequest(): Promise<AuthorizationRequest> {
    const config = await this.config();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: 'openid email profile',
      response_type: 'code',
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url, state, nonce, codeVerifier };
  }

  /** Exchanges the code and validates the ID token (signature, iss, aud, exp, nonce). */
  async completeAuthorization(
    callbackUrl: URL,
    expected: { state: string; nonce: string; codeVerifier: string },
  ): Promise<IdentityClaims> {
    const config = await this.config();
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: expected.codeVerifier,
      expectedState: expected.state,
      expectedNonce: expected.nonce,
      idTokenExpected: true,
    });
    return identityClaimsSchema.parse(tokens.claims());
  }
}
