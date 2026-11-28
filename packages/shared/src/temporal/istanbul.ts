import { Temporal, type Instant, type PlainDate } from './temporal.js';

/** All business days (voting windows, event dates) are defined in this zone. */
export const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';

export interface DayWindow {
  /** Inclusive start: 00:00 Istanbul time. */
  readonly opensAt: Instant;
  /** Exclusive end: 00:00 Istanbul time of the next day (i.e. through 23:59:59.999…). */
  readonly closesAt: Instant;
}

export function nowInstant(): Instant {
  return Temporal.Now.instant();
}

/** The calendar date in Istanbul at the given instant. */
export function istanbulDateOf(instant: Instant): PlainDate {
  return instant.toZonedDateTimeISO(ISTANBUL_TIME_ZONE).toPlainDate();
}

/** The half-open [opensAt, closesAt) window covering one Istanbul calendar day. */
export function istanbulDayWindow(day: PlainDate): DayWindow {
  const opensAt = day.toZonedDateTime({ timeZone: ISTANBUL_TIME_ZONE }).toInstant();
  const closesAt = day
    .add({ days: 1 })
    .toZonedDateTime({ timeZone: ISTANBUL_TIME_ZONE })
    .toInstant();
  return { opensAt, closesAt };
}

export function isWithinDayWindow(window: DayWindow, instant: Instant): boolean {
  return (
    Temporal.Instant.compare(instant, window.opensAt) >= 0 &&
    Temporal.Instant.compare(instant, window.closesAt) < 0
  );
}
