import type { NestExpressApplication } from '@nestjs/platform-express';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { errorBodySchema, healthResponseSchema } from '@etkinlik/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.factory.js';
import { loadEnv } from '../src/config/env.js';

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;
let app: NestExpressApplication | undefined;
let baseUrl: string;

beforeAll(async () => {
  const [startedPostgres, startedRedis] = await Promise.all([
    new PostgreSqlContainer('postgres:18-alpine').start(),
    new RedisContainer('redis:8-alpine').start(),
  ]);
  postgres = startedPostgres;
  redis = startedRedis;
  const env = loadEnv({
    NODE_ENV: 'test',
    APP_ORIGIN: 'https://etkinlik.localhost',
    DATABASE_URL: startedPostgres.getConnectionUri(),
    REDIS_URL: startedRedis.getConnectionUrl(),
    LOG_LEVEL: 'error',
  });
  const started = await createApp(env);
  app = started;
  await started.listen(0, '127.0.0.1');
  baseUrl = (await started.getUrl()).replace('[::1]', '127.0.0.1');
});

afterAll(async () => {
  await app?.close();
  await Promise.all([postgres?.stop(), redis?.stop()]);
});

describe('health endpoints', () => {
  it('reports liveness without touching dependencies', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/live`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(healthResponseSchema.parse(await response.json()).status).toBe('ok');
  });

  it('reports readiness against real PostgreSQL and Redis', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/ready`);
    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      checks: { database: 'ok', redis: 'ok' },
    });
  });

  it('assigns a UUIDv7 request id to every response', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/live`);
    expect(response.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('does not expose framework fingerprints or CORS headers', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/live`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.headers.get('x-powered-by')).toBeNull();
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('default-deny and error body', () => {
  it('returns the single error body with the request id for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    expect(response.status).toBe(404);
    const body = errorBodySchema.parse(await response.json());
    expect(body.code).toBe('NOT_FOUND');
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
  });

  it('rejects oversized JSON bodies without leaking details', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blob: 'x'.repeat(200_000) }),
    });
    expect(response.status).toBe(413);
    const body = errorBodySchema.parse(await response.json());
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
