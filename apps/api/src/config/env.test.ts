import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from './env.js';

const valid = {
  NODE_ENV: 'test',
  APP_ORIGIN: 'https://etkinlik.localhost',
  DATABASE_URL: 'postgresql://app:secret@localhost:5432/app',
  REDIS_URL: 'redis://localhost:6379', // nosemgrep: trailofbits.generic.redis-unencrypted-transport.redis-unencrypted-transport
  OIDC_ISSUER: 'https://etkinlik.localhost/idp/realms/etkinlik',
  OIDC_CLIENT_ID: 'etkinlik-web',
  OIDC_CLIENT_SECRET: '0123456789abcdef0123456789abcdef',
  INITIAL_ADMIN_EMAIL: 'Admin@Uni.Example',
  STORAGE_DRIVER: 'memory',
  QR_SIGNING_SECRET: 'qr-test-secret-0123456789abcdef0123',
  EMAIL_DRIVER: 'memory',
  EMAIL_FROM: 'Etkinlik <bildirim@etkinlik.test>',
};

describe('loadEnv', () => {
  it('accepts a complete configuration and applies safe defaults', () => {
    const env = loadEnv(valid);
    expect(env.API_PORT).toBe(3000);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it.each([
    'NODE_ENV',
    'APP_ORIGIN',
    'DATABASE_URL',
    'REDIS_URL',
    'OIDC_ISSUER',
    'OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
    'INITIAL_ADMIN_EMAIL',
  ] as const)('refuses to start without %s', (key) => {
    const { [key]: _omitted, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(ConfigError);
  });

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

  it('lower-cases the initial admin e-mail', () => {
    expect(loadEnv(valid).INITIAL_ADMIN_EMAIL).toBe('admin@uni.example');
  });

  it('refuses an http issuer unless explicitly allowed outside production', () => {
    const httpIssuer = { ...valid, OIDC_ISSUER: 'http://keycloak:8080/idp/realms/etkinlik' };
    expect(() => loadEnv(httpIssuer)).toThrow(ConfigError);
    expect(
      loadEnv({ ...httpIssuer, OIDC_ALLOW_INSECURE_HTTP: 'true' }).OIDC_ALLOW_INSECURE_HTTP,
    ).toBe(true);
    expect(() =>
      loadEnv({ ...httpIssuer, OIDC_ALLOW_INSECURE_HTTP: 'true', NODE_ENV: 'production' }),
    ).toThrow(ConfigError);
  });

  it('refuses a short client secret and an idle timeout above the absolute one', () => {
    expect(() => loadEnv({ ...valid, OIDC_CLIENT_SECRET: 'short' })).toThrow(ConfigError);
    expect(() =>
      loadEnv({ ...valid, SESSION_IDLE_SECONDS: '7200', SESSION_ABSOLUTE_SECONDS: '3600' }),
    ).toThrow(ConfigError);
  });

  it('requires S3 settings for the s3 storage driver and refuses memory in production', () => {
    expect(() => loadEnv({ ...valid, STORAGE_DRIVER: 's3' })).toThrow(ConfigError);
    expect(() => loadEnv({ ...valid, NODE_ENV: 'production' })).toThrow(ConfigError);
    expect(
      loadEnv({
        ...valid,
        STORAGE_DRIVER: 's3',
        S3_ENDPOINT: 'http://garage:3900',
        S3_ACCESS_KEY_ID: 'GKexample',
        S3_SECRET_ACCESS_KEY: 'secret',
      }).S3_BUCKET,
    ).toBe('etkinlik-media');
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
