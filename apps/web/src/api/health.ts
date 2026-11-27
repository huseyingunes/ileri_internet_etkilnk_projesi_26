import { healthResponseSchema, type HealthResponse } from '@etkinlik/shared';

const HEALTH_TIMEOUT_MS = 5_000;

/** Same-origin call (Caddy proxies /api); the response is validated with the shared schema. */
export async function fetchLiveness(signal?: AbortSignal): Promise<HealthResponse> {
  const timeout = AbortSignal.timeout(HEALTH_TIMEOUT_MS);
  const response = await fetch('/api/v1/health/live', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
  });
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return healthResponseSchema.parse(await response.json());
}
