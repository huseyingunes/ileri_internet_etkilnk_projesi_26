import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Temporal } from './temporal.js';
import {
  istanbulDateOf,
  istanbulDayWindow,
  istanbulLocalToIso,
  isoToIstanbulLocal,
  isWithinDayWindow,
} from './istanbul.js';

// 2000-01-01 .. 2100-01-01 in epoch milliseconds.
const epochMs = fc.integer({ min: 946_684_800_000, max: 4_102_444_800_000 });

describe('istanbul day window', () => {
  it('contains every instant of its own Istanbul date', () => {
    fc.assert(
      fc.property(epochMs, (ms) => {
        const instant = Temporal.Instant.fromEpochMilliseconds(ms);
        const window = istanbulDayWindow(istanbulDateOf(instant));
        expect(isWithinDayWindow(window, instant)).toBe(true);
      }),
    );
  });

  it('is half-open: the closing instant belongs to the next day', () => {
    fc.assert(
      fc.property(epochMs, (ms) => {
        const day = istanbulDateOf(Temporal.Instant.fromEpochMilliseconds(ms));
        const window = istanbulDayWindow(day);
        expect(isWithinDayWindow(window, window.opensAt)).toBe(true);
        expect(isWithinDayWindow(window, window.closesAt)).toBe(false);
        expect(istanbulDateOf(window.closesAt).equals(day.add({ days: 1 }))).toBe(true);
      }),
    );
  });

  it('starts at 00:00 Istanbul (UTC+3) for a known date', () => {
    const window = istanbulDayWindow(Temporal.PlainDate.from('2026-11-28'));
    expect(window.opensAt.toString()).toBe('2026-11-27T21:00:00Z');
    expect(window.closesAt.toString()).toBe('2026-11-28T21:00:00Z');
  });

  it('treats 23:59:59.999 as still inside the day', () => {
    const window = istanbulDayWindow(Temporal.PlainDate.from('2026-11-28'));
    const lastMoment = Temporal.Instant.from('2026-11-28T20:59:59.999Z');
    expect(isWithinDayWindow(window, lastMoment)).toBe(true);
  });
});

describe('Istanbul wall time conversion', () => {
  it('round-trips datetime-local values', () => {
    expect(istanbulLocalToIso('2027-03-10T10:00')).toBe('2027-03-10T10:00+03:00');
    expect(isoToIstanbulLocal('2027-03-10T07:00:00Z')).toBe('2027-03-10T10:00');
  });
});
