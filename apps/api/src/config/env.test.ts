import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from './env.js';

const valid = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'https://etkinlik.localhost',
  DATABASE_URL: 'postgresql://app:secret@localhost:5432/app',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', () => {
  it('accepts a complete configuration and applies safe defaults', () => {
    const env = loadEnv(valid);
    expect(env.API_PORT).toBe(3000);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it.each(['NODE_ENV', 'APP_ORIGIN', 'DATABASE_URL', 'REDIS_URL'] as const)(
    'refuses to start without %s',
    (key) => {
      const { [key]: _omitted, ...rest } = valid;
      expect(() => loadEnv(rest)).toThrow(ConfigError);
    },
  );

  it('treats empty strings as missing', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: '' })).toThrow(ConfigError);
  });

  it.each(['0', '-5', '1.5', 'abc'])('rejects non-positive tuning value %s', (value) => {
    expect(() => loadEnv({ ...valid, API_DB_POOL_SIZE: value })).toThrow(ConfigError);
    expect(() => loadEnv({ ...valid, SHUTDOWN_TIMEOUT_MS: value })).toThrow(ConfigError);
  });

  it('accepts both postgres:// and postgresql:// schemes', () => {
    expect(loadEnv({ ...valid, DATABASE_URL: 'postgres://a:b@db:5432/app' }).DATABASE_URL).toMatch(
      /^postgres:/,
    );
  });

  it('requires an https origin', () => {
    expect(() => loadEnv({ ...valid, APP_ORIGIN: 'http://etkinlik.localhost' })).toThrow(
      ConfigError,
    );
  });

  it('never echoes secret values in the error message', () => {
    try {
      loadEnv({ ...valid, DATABASE_URL: 'mysql://app:topsecret@db/app' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('topsecret');
    }
  });
});
