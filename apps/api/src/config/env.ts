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
export const envSchema = z.object({
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
