import type { Temporal as TemporalNamespace } from '@js-temporal/polyfill';

type TemporalApi = typeof TemporalNamespace;

export type Instant = TemporalNamespace.Instant;
export type PlainDate = TemporalNamespace.PlainDate;
export type ZonedDateTime = TemporalNamespace.ZonedDateTime;
export type Duration = TemporalNamespace.Duration;

function isTemporalApi(candidate: unknown): candidate is TemporalApi {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    'Now' in candidate &&
    'Instant' in candidate &&
    'PlainDate' in candidate
  );
}

/**
 * Uses the runtime's native Temporal when available (Node 26, modern browsers)
 * and loads the polyfill only as a fallback, so it is not shipped to clients
 * that do not need it.
 */
async function loadTemporal(): Promise<TemporalApi> {
  const native: unknown = Reflect.get(globalThis, 'Temporal');
  if (isTemporalApi(native)) {
    return native;
  }
  const polyfill = await import('@js-temporal/polyfill');
  return polyfill.Temporal;
}

export const Temporal: TemporalApi = await loadTemporal();
