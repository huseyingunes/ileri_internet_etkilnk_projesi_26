import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { errorBodySchema } from '@etkinlik/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory.js';
import { loadEnv } from '../src/config/env.js';
import { loginFormAction, TestBrowser } from './support/browser.js';
import { type MigratedDatabase, runSqlFile, startMigratedDatabase } from './support/database.js';
import { type StartedKeycloak, startKeycloak } from './support/keycloak.js';

const APP_ORIGIN = 'https://etkinlik.test';
const SEED_FILE = fileURLToPath(new URL('../../../deploy/demo/seed.sql', import.meta.url));
const INITIAL_ADMIN_EMAIL = 'ilk.yonetici@uni.example';
const clientSecret = randomBytes(24).toString('hex');
const demoPassword = `Demo-${randomBytes(8).toString('hex')}`;

let db: MigratedDatabase | undefined;
let redis: StartedRedisContainer | undefined;
let keycloak: StartedKeycloak | undefined;
let app: NestExpressApplication | undefined;
let base = '';

function demoUser(role: 'student' | 'advisor' | 'admin', index = 0): string {
  const user = keycloak?.users.filter((u) => u.role === role)[index];
  if (user === undefined) throw new Error(`no demo ${role} #${index.toString()}`);
  return user.username;
}

/** Runs the full browser flow: app → Keycloak login form → callback → session cookie. */
async function login(username: string, returnTo = '/profil'): Promise<TestBrowser> {
  const browser = new TestBrowser();
  const start = await browser.request(
    `${base}/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  );
  expect(start.status).toBe(302);
  const authorizeUrl = start.headers.get('location') ?? '';
  expect(authorizeUrl).toContain('code_challenge_method=S256');

  const form = await browser.request(authorizeUrl);
  expect(form.status).toBe(200);
  const action = loginFormAction(await form.text());
  const submitted = await browser.request(action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password: demoPassword }).toString(),
  });
  expect(submitted.status).toBe(302);
  const callback = new URL(submitted.headers.get('location') ?? '');
  expect(callback.origin).toBe(APP_ORIGIN);

  const done = await browser.request(`${base}${callback.pathname}${callback.search}`);
  expect(done.status).toBe(302);
  expect(done.headers.get('location')).toBe(returnTo);
  return browser;
}

const appHost = () => new URL(base).host;

async function api(
  browser: TestBrowser,
  path: string,
  init: Parameters<TestBrowser['request']>[1] = {},
) {
  return await browser.request(`${base}/api/v1${path}`, init);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null) throw new Error('expected JSON object');
  return body as Record<string, unknown>;
}

beforeAll(async () => {
  const [startedDb, startedRedis] = await Promise.all([
    startMigratedDatabase(),
    new RedisContainer('redis:8-alpine').start(),
  ]);
  db = startedDb;
  redis = startedRedis;
  await db.container.copyFilesToContainer([{ source: SEED_FILE, target: '/seed/seed.sql' }]);
  await runSqlFile(db.container, '/seed/seed.sql');
  keycloak = await startKeycloak({
    appOrigin: APP_ORIGIN,
    clientSecret,
    demoPassword,
    initialAdminEmail: INITIAL_ADMIN_EMAIL,
  });

  const env = loadEnv({
    NODE_ENV: 'test',
    APP_ORIGIN,
    DATABASE_URL: db.url,
    REDIS_URL: redis.getConnectionUrl(),
    LOG_LEVEL: 'error',
    OIDC_ISSUER: keycloak.issuer,
    OIDC_CLIENT_ID: 'etkinlik-web',
    OIDC_CLIENT_SECRET: clientSecret,
    OIDC_ALLOW_INSECURE_HTTP: 'true',
    INITIAL_ADMIN_EMAIL,
    STORAGE_DRIVER: 'memory',
    QR_SIGNING_SECRET: 'qr-test-secret-0123456789abcdef0123',
  });
  const started = await createApp(env);
  app = started;
  await started.listen(0, '127.0.0.1');
  base = (await started.getUrl()).replace('[::1]', '127.0.0.1');
}, 300_000);

afterAll(async () => {
  await app?.close();
  await db?.prisma.$disconnect();
  await Promise.all([db?.container.stop(), redis?.stop(), keycloak?.container.stop()]);
});

describe('OIDC login and sessions', () => {
  it('logs a seeded student in and exposes their profile and communities', async () => {
    const browser = await login(demoUser('student'));
    const session = browser.cookie(appHost(), '__Host-session');
    expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const response = await api(browser, '/me');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const me = await json(response);
    expect(me['role']).toBe('student');
    expect(me['studentNumber']).toMatch(/^2026\d{4}$/);
    expect(Array.isArray(me['communities'])).toBe(true);
  });

  it('assigns the admin role to the configured initial admin on first login and audits it', async () => {
    const browser = await login('yonetici');
    const me = await json(await api(browser, '/me'));
    expect(me['role']).toBe('admin');
    expect(me['email']).toBe(INITIAL_ADMIN_EMAIL);
    const audit = await json(await api(browser, '/audit-log?action=user.initial_admin_assigned'));
    expect(audit['items']).toHaveLength(1);
  });

  it('rejects a callback whose state is not bound to this browser (login CSRF)', async () => {
    const victim = new TestBrowser();
    const start = await victim.request(`${base}/api/v1/auth/login`);
    const authorizeUrl = new URL(start.headers.get('location') ?? '');
    const forged = await victim.request(
      `${base}/api/v1/auth/callback?code=forged&state=${authorizeUrl.searchParams.get('state') ?? ''}x`,
    );
    expect(forged.status).toBe(302);
    expect(forged.headers.get('location')).toBe('/?giris=hata');
    expect(victim.cookie(appHost(), '__Host-session')).toBeUndefined();
  });

  it("rejects an attacker's valid callback URL opened in another browser", async () => {
    const attacker = new TestBrowser();
    const start = await attacker.request(`${base}/api/v1/auth/login`);
    const form = await attacker.request(start.headers.get('location') ?? '');
    const submitted = await attacker.request(loginFormAction(await form.text()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: demoUser('student', 8),
        password: demoPassword,
      }).toString(),
    });
    const callback = new URL(submitted.headers.get('location') ?? '');

    const victim = new TestBrowser();
    const forced = await victim.request(`${base}${callback.pathname}${callback.search}`);
    expect(forced.headers.get('location')).toBe('/?giris=hata');
    expect(victim.cookie(appHost(), '__Host-session')).toBeUndefined();
  });

  it('refuses open redirects in returnTo', async () => {
    const response = await new TestBrowser().request(
      `${base}/api/v1/auth/login?returnTo=${encodeURIComponent('//evil.example')}`,
    );
    expect(response.status).toBe(422);
  });

  it('logs out with Clear-Site-Data and invalidates the session server-side', async () => {
    const browser = await login(demoUser('student', 1));
    const token = browser.cookie(appHost(), '__Host-session') ?? '';
    const logout = await api(browser, '/auth/logout', { method: 'POST' });
    expect(logout.status).toBe(204);
    expect(logout.headers.get('clear-site-data')).toContain('"cookies"');

    // Replaying the old cookie must not work.
    const replay = new TestBrowser();
    replay.setCookie(appHost(), '__Host-session', token);
    expect((await api(replay, '/me')).status).toBe(401);
  });
});

describe('authorization', () => {
  it('answers 401 without a session and 403 for the wrong role', async () => {
    const anonymous = await api(new TestBrowser(), '/users');
    expect(anonymous.status).toBe(401);
    expect(errorBodySchema.parse(await anonymous.json()).code).toBe('UNAUTHENTICATED');

    const student = await login(demoUser('student', 2));
    const forbidden = await api(student, '/users');
    expect(forbidden.status).toBe(403);
    expect(errorBodySchema.parse(await forbidden.json()).code).toBe('FORBIDDEN');
  });

  it('lets an admin change a role, audits it and ends the affected sessions', async () => {
    const student = await login(demoUser('student', 3));
    const studentMe = await json(await api(student, '/me'));
    const admin = await login('yonetici');

    const changed = await api(admin, `/users/${String(studentMe['id'])}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'advisor' }),
    });
    expect(changed.status).toBe(200);
    expect((await json(changed))['role']).toBe('advisor');
    expect((await api(student, '/me')).status).toBe(401);

    const audit = await json(await api(admin, '/audit-log?action=user.updated'));
    expect(audit['items']).toHaveLength(1);
  });

  it('blocks cross-site state-changing requests with Fetch Metadata', async () => {
    const browser = await login(demoUser('student', 4));
    const response = await api(browser, '/auth/logout', {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
    expect((await api(browser, '/me')).status).toBe(200);
  });

  it('rate limits profile updates with Retry-After', async () => {
    const browser = await login(demoUser('student', 5));
    let last: Response | undefined;
    for (let i = 0; i < 21; i += 1) {
      last = await api(browser, '/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: null }),
      });
    }
    expect(last?.status).toBe(429);
    expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(last?.headers.get('ratelimit-remaining')).toBe('0');
  });
});

describe('profile and consent', () => {
  it('requires WhatsApp consent for a phone number and drops it when consent is revoked', async () => {
    const browser = await login(demoUser('student', 6));
    const patch = (phone: string | null) =>
      api(browser, '/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

    expect((await patch('+905551112233')).status).toBe(422);
    const granted = await api(browser, '/me/consents/whatsapp', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textVersion: '2026-11' }),
    });
    expect(granted.status).toBe(200);
    expect((await json(await patch('+905551112233')))['phone']).toBe('+905551112233');

    expect((await api(browser, '/me/consents/whatsapp', { method: 'DELETE' })).status).toBe(204);
    expect((await json(await api(browser, '/me')))['phone']).toBeUndefined();
  });
});

describe('communities', () => {
  it('lets admins create communities and advisors manage only their own', async () => {
    const admin = await login('yonetici');
    const created = await api(admin, '/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fotoğrafçılık Topluluğu', description: 'Gezi ve atölyeler.' }),
    });
    expect(created.status).toBe(201);
    const community = await json(created);
    expect(created.headers.get('location')).toBe(`/api/v1/communities/${String(community['id'])}`);

    const advisor = await login(demoUser('advisor'));
    const advisorMe = await json(await api(advisor, '/me'));
    const own = (advisorMe['communities'] as { id: string }[])[0];
    expect(own).toBeDefined();

    const student = await login(demoUser('student', 7));
    const studentMe = await json(await api(student, '/me'));
    const add = (communityId: string, userId: unknown) =>
      api(advisor, `/communities/${communityId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

    expect((await add(own?.id ?? '', studentMe['id'])).status).toBe(204);
    expect((await add(own?.id ?? '', studentMe['id'])).status).toBe(204); // idempotent
    expect((await add(String(community['id']), studentMe['id'])).status).toBe(403);
    expect((await add(own?.id ?? '', advisorMe['id'])).status).toBe(422);

    const duplicate = await api(admin, '/communities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fotoğrafçılık Topluluğu' }),
    });
    expect(duplicate.status).toBe(409);
  });
});
