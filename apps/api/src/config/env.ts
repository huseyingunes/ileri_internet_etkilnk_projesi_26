import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();

const secureUrl = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', { error: 'must use https' });

/**
 * Environment contract. Every required value has no default; a missing or
 * invalid value stops the process at startup instead of running insecurely.
 * Non-secret tuning values (ports, pool sizes, timeouts) may have defaults but
 * must still be positive.
 */
const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    APP_ORIGIN: secureUrl,
    DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value), {
      error: 'must be a postgres:// or postgresql:// URL',
    }),
    // Plain (non-TLS) Redis is accepted: it lives on an internal, single-host network (see compose.yaml).
    REDIS_URL: z.url().refine((value) => /^rediss?:\/\//.test(value), {
      // nosemgrep: trailofbits.generic.redis-unencrypted-transport.redis-unencrypted-transport
      error: 'must be a redis:// or rediss:// URL',
    }),
    API_PORT: positiveInt.max(65_535).default(3000),
    API_DB_POOL_SIZE: positiveInt.max(100).default(10),
    WORKER_DB_POOL_SIZE: positiveInt.max(100).default(5),
    WORKER_HEALTH_PORT: positiveInt.max(65_535).default(3001),
    WORKER_CONCURRENCY: positiveInt.max(100).default(5),
    SHUTDOWN_TIMEOUT_MS: positiveInt.max(120_000).default(25_000),
    EXTERNAL_CALL_TIMEOUT_MS: positiveInt.max(60_000).default(5_000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    SENTRY_DSN: z.url().optional(),
    // OpenID Connect (Keycloak plays the university SSO; ADR 0011).
    OIDC_ISSUER: z.url(),
    // Optional private base URL for back-channel calls (discovery, token, JWKS).
    OIDC_INTERNAL_ISSUER: z.url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).max(255),
    OIDC_CLIENT_SECRET: z.string().min(16).max(512),
    // Only for local tests against an http IdP; refused in production below.
    OIDC_ALLOW_INSECURE_HTTP: booleanFlag.default(false),
    INITIAL_ADMIN_EMAIL: z.email().transform((value) => value.toLowerCase()),
    SESSION_IDLE_SECONDS: positiveInt.max(86_400).default(1_800),
    SESSION_ABSOLUTE_SECONDS: positiveInt.max(604_800).default(43_200),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.OIDC_ALLOW_INSECURE_HTTP) {
      context.addIssue({
        code: 'custom',
        path: ['OIDC_ALLOW_INSECURE_HTTP'],
        message: 'must be false in production',
      });
    }
    if (!env.OIDC_ALLOW_INSECURE_HTTP && new URL(env.OIDC_ISSUER).protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: ['OIDC_ISSUER'], message: 'must use https' });
    }
    if (env.SESSION_IDLE_SECONDS > env.SESSION_ABSOLUTE_SECONDS) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_IDLE_SECONDS'],
        message: 'must not exceed SESSION_ABSOLUTE_SECONDS',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/** Parses the environment; error messages name variables but never echo values. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const normalized = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}
