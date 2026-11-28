import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { returnToSchema } from '@etkinlik/shared';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../../common/auth/public.decorator.js';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { expireHostCookie, readCookie, serializeHostCookie } from '../../common/http/cookies.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import {
  LOGIN_STATE_COOKIE,
  LOGIN_STATE_TTL_SECONDS,
  LoginStateStore,
} from './login-state.store.js';
import { OidcService } from './oidc.service.js';
import { SESSION_COOKIE, SessionStore } from './session.store.js';
import { UsersService } from './users.service.js';

const loginQuerySchema = z.object({ returnTo: returnToSchema.optional() });
const LOGIN_FAILED_PATH = '/?giris=hata';

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly oidc: OidcService,
    private readonly loginStates: LoginStateStore,
    private readonly sessions: SessionStore,
    private readonly users: UsersService,
    @InjectPinoLogger(AuthController.name) private readonly logger: PinoLogger,
  ) {}

  /** Starts the OIDC authorization code flow with PKCE (S256), state and nonce. */
  @Public()
  @RateLimit({ name: 'auth-login', limit: 30, windowSeconds: 60, by: 'ip' })
  @Get('login')
  async login(@Query() query: unknown, @Res() response: Response): Promise<void> {
    const { returnTo } = loginQuerySchema.parse(query);
    const request = await this.oidc.createAuthorizationRequest();
    await this.loginStates.save(request.state, {
      codeVerifier: request.codeVerifier,
      nonce: request.nonce,
      returnTo: returnTo ?? '/',
    });
    // Binds the flow to this browser (login CSRF protection). Lax: sent on the IdP redirect back.
    response.setHeader(
      'Set-Cookie',
      serializeHostCookie(LOGIN_STATE_COOKIE, request.state, {
        sameSite: 'Lax',
        maxAgeSeconds: LOGIN_STATE_TTL_SECONDS,
      }),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(302, request.url.href);
  }

  /** OIDC redirect target (GET; form_post is not used). Rotates the session id on login. */
  @Public()
  @RateLimit({ name: 'auth-callback', limit: 30, windowSeconds: 60, by: 'ip' })
  @Get('callback')
  async callback(@Req() request: Request, @Res() response: Response): Promise<void> {
    const cookies = [expireHostCookie(LOGIN_STATE_COOKIE)];
    try {
      const callbackUrl = new URL(request.originalUrl, this.env.APP_ORIGIN);
      const state = callbackUrl.searchParams.get('state') ?? '';
      const boundState = readCookie(request, LOGIN_STATE_COOKIE) ?? '';
      if (state === '' || !sameSecret(state, boundState)) {
        throw new Error('login state does not match this browser');
      }
      const saved = await this.loginStates.consume(state);
      if (saved === undefined) {
        throw new Error('login state expired or already used');
      }
      const claims = await this.oidc.completeAuthorization(callbackUrl, {
        state,
        nonce: saved.nonce,
        codeVerifier: saved.codeVerifier,
      });
      const user = await this.users.provision(claims);

      const previous = readCookie(request, SESSION_COOKIE);
      if (previous !== undefined) await this.sessions.destroy(previous);
      const token = await this.sessions.create(user.id);
      cookies.push(
        serializeHostCookie(SESSION_COOKIE, token, {
          sameSite: 'Lax',
          maxAgeSeconds: this.env.SESSION_ABSOLUTE_SECONDS,
        }),
      );
      response.setHeader('Set-Cookie', cookies);
      response.setHeader('Cache-Control', 'no-store');
      response.redirect(302, returnToSchema.catch('/').parse(saved.returnTo));
    } catch (error) {
      this.logger.warn({ err: error }, 'Login failed');
      response.setHeader('Set-Cookie', cookies);
      response.setHeader('Cache-Control', 'no-store');
      response.redirect(302, LOGIN_FAILED_PATH);
    }
  }

  @Roles('student', 'advisor', 'admin')
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() auth: AuthContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.destroy(auth.sessionToken);
    response.setHeader('Set-Cookie', expireHostCookie(SESSION_COOKIE));
    response.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
  }
}
