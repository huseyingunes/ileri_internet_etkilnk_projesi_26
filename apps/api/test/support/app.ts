import { fileURLToPath } from 'node:url';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Logger } from 'nestjs-pino';
import { createApp } from '../../src/app.factory.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { SessionStore } from '../../src/modules/identity/session.store.js';
import { WorkerModule } from '../../src/worker/worker.module.js';
import { TestBrowser } from './browser.js';
import { type MigratedDatabase, runSqlFile, startMigratedDatabase } from './database.js';

const SEED_FILE = fileURLToPath(new URL('../../../../deploy/demo/seed.sql', import.meta.url));

export interface TestApp {
  db: MigratedDatabase;
  redis: StartedRedisContainer;
  app: NestExpressApplication;
  worker: INestApplicationContext | undefined;
  env: Env;
  base: string;
  /** A browser signed in as the n-th seeded user of a role (session created directly). */
  loginAs(
    role: 'student' | 'advisor' | 'admin',
    index?: number,
  ): Promise<TestBrowser & { userId: bigint }>;
  stop(): Promise<void>;
}

/**
 * API (and optionally the worker) against real PostgreSQL and Redis with the
 * demo seed loaded. OIDC itself is covered by auth.int.test.ts; here sessions
 * are created directly so feature tests stay fast.
 */
export async function startTestApp(options: { worker?: boolean } = {}): Promise<TestApp> {
  const [db, redis] = await Promise.all([
    startMigratedDatabase(),
    new RedisContainer('redis:8-alpine').start(),
  ]);
  await db.container.copyFilesToContainer([{ source: SEED_FILE, target: '/seed/seed.sql' }]);
  await runSqlFile(db.container, '/seed/seed.sql');

  const env = loadEnv({
    NODE_ENV: 'test',
    APP_ORIGIN: 'https://etkinlik.test',
    DATABASE_URL: db.url,
    REDIS_URL: redis.getConnectionUrl(),
    LOG_LEVEL: 'error',
    OIDC_ISSUER: 'https://idp.invalid/idp/realms/etkinlik',
    OIDC_CLIENT_ID: 'etkinlik-web',
    OIDC_CLIENT_SECRET: 'feature-tests-secret-0123456789',
    INITIAL_ADMIN_EMAIL: 'admin@uni.example',
    STORAGE_DRIVER: 'memory',
    WORKER_HEALTH_PORT: '39101',
  });
  const app = await createApp(env);
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  let worker: INestApplicationContext | undefined;
  if (options.worker === true) {
    worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), {
      bufferLogs: true,
    });
    worker.useLogger(worker.get(Logger));
    await worker.init();
  }

  const sessions = app.get(SessionStore);
  return {
    db,
    redis,
    app,
    worker,
    env,
    base,
    async loginAs(role, index = 0) {
      const users = await db.prisma.users.findMany({
        where: { role, is_active: true },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      const user = users[index];
      if (user === undefined) throw new Error(`no seeded ${role} #${index.toString()}`);
      const browser = Object.assign(new TestBrowser(), { userId: user.id });
      browser.setCookie(new URL(base).host, '__Host-session', await sessions.create(user.id));
      return browser;
    },
    async stop() {
      await worker?.close();
      await app.close();
      await db.prisma.$disconnect();
      await Promise.all([db.container.stop(), redis.stop()]);
    },
  };
}

/** JSON request helper for feature tests. */
export async function call(
  t: TestApp,
  browser: TestBrowser,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const response = await browser.request(`${t.base}/api/v1${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const parsed: unknown = text === '' ? {} : JSON.parse(text);
  return {
    status: response.status,
    body: typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {},
    headers: response.headers,
  };
}
