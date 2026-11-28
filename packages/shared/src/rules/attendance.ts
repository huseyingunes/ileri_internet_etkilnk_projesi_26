import { Temporal, type Instant } from '../temporal/temporal.js';
import { ISTANBUL_TIME_ZONE } from '../temporal/istanbul.js';

/**
 * Pure attendance rules (prompt section 10): location radius and presence for
 * at least 50% of the event duration.
 */

const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Readings worse than this are not trusted to decide presence. */
export const MAX_LOCATION_ACCURACY_M = 500;

export interface Window {
  start: Instant;
  end: Instant;
}

/**
 * The scheduled windows of an event. A multi-day event repeats its start and
 * end clock times every day (e.g. a festival 09:00–18:00 for three days); if
 * the end clock time is not after the start clock time, the event is one
 * continuous span (e.g. an overnight event). See ADR 0014.
 */
export function scheduledWindows(startsAt: Instant, endsAt: Instant): Window[] {
  const start = startsAt.toZonedDateTimeISO(ISTANBUL_TIME_ZONE);
  const end = endsAt.toZonedDateTimeISO(ISTANBUL_TIME_ZONE);
  const firstDay = start.toPlainDate();
  const lastDay = end.toPlainDate();
  const days = firstDay.until(lastDay, { largestUnit: 'days' }).days;
  const startClock = start.toPlainTime();
  const endClock = end.toPlainTime();
  if (days === 0 || Temporal.PlainTime.compare(endClock, startClock) <= 0) {
    return [{ start: startsAt, end: endsAt }];
  }
  return Array.from({ length: days + 1 }, (_, index) => {
    const day = firstDay.add({ days: index });
    return {
      start: day
        .toZonedDateTime({ timeZone: ISTANBUL_TIME_ZONE, plainTime: startClock })
        .toInstant(),
      end: day.toZonedDateTime({ timeZone: ISTANBUL_TIME_ZONE, plainTime: endClock }).toInstant(),
    };
  });
}

const seconds = (a: Instant, b: Instant) =>
  Math.max(0, (b.epochMilliseconds - a.epochMilliseconds) / 1000);
const later = (a: Instant, b: Instant) => (Temporal.Instant.compare(a, b) >= 0 ? a : b);
const earlier = (a: Instant, b: Instant) => (Temporal.Instant.compare(a, b) <= 0 ? a : b);

/** Half of the total scheduled duration (e.g. 60 minutes of a 120-minute event). */
export function requiredPresenceSeconds(windows: readonly Window[]): number {
  return windows.reduce((sum, w) => sum + seconds(w.start, w.end), 0) / 2;
}

/** Scans are accepted from 15 minutes before the start until 15 minutes after the end. */
export const SCAN_GRACE_MINUTES = 15;

/**
 * Presence = for each window, the time between the first and the last accepted
 * scan made within the window or its 15-minute grace (clipped to the window),
 * summed over windows. Arriving a few minutes early therefore still counts.
 */
export function presenceSeconds(
  windows: readonly Window[],
  acceptedScans: readonly Instant[],
): number {
  let total = 0;
  for (const window of windows) {
    const from = window.start.subtract({ minutes: SCAN_GRACE_MINUTES });
    const to = window.end.add({ minutes: SCAN_GRACE_MINUTES });
    const inside = acceptedScans.filter(
      (scan) =>
        Temporal.Instant.compare(scan, from) >= 0 && Temporal.Instant.compare(scan, to) <= 0,
    );
    if (inside.length < 2) continue;
    const first = inside.reduce(earlier);
    const last = inside.reduce(later);
    total += seconds(later(first, window.start), earlier(last, window.end));
  }
  return total;
}

export function hasAttended(
  windows: readonly Window[],
  acceptedScans: readonly Instant[],
): boolean {
  const required = requiredPresenceSeconds(windows);
  return required > 0 && presenceSeconds(windows, acceptedScans) >= required;
}
