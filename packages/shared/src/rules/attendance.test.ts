import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Temporal } from '../temporal/temporal.js';
import {
  distanceMeters,
  hasAttended,
  presenceSeconds,
  requiredPresenceSeconds,
  scheduledWindows,
} from './attendance.js';

const at = (iso: string) => Temporal.Instant.from(iso);

describe('distanceMeters', () => {
  it('is zero for the same point and symmetric', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -89, max: 89, noNaN: true }),
        fc.double({ min: -179, max: 179, noNaN: true }),
        fc.double({ min: -89, max: 89, noNaN: true }),
        fc.double({ min: -179, max: 179, noNaN: true }),
        (lat1, lon1, lat2, lon2) => {
          const a = { latitude: lat1, longitude: lon1 };
          const b = { latitude: lat2, longitude: lon2 };
          expect(distanceMeters(a, a)).toBeCloseTo(0, 6);
          expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
        },
      ),
    );
  });

  it('matches a known distance (about 111 km per degree of latitude)', () => {
    expect(
      distanceMeters({ latitude: 41, longitude: 29 }, { latitude: 42, longitude: 29 }),
    ).toBeCloseTo(111_195, -2);
  });
});

describe('50% presence rule', () => {
  const windows = scheduledWindows(at('2027-03-10T07:00:00Z'), at('2027-03-10T09:00:00Z')); // 120 min

  it('requires 60 of 120 minutes', () => {
    expect(requiredPresenceSeconds(windows)).toBe(3600);
  });

  it('is exact at the boundary: 60 minutes attends, 59:59 does not', () => {
    expect(hasAttended(windows, [at('2027-03-10T07:00:00Z'), at('2027-03-10T08:00:00Z')])).toBe(
      true,
    );
    expect(hasAttended(windows, [at('2027-03-10T07:00:01Z'), at('2027-03-10T08:00:00Z')])).toBe(
      false,
    );
  });

  it('needs at least two scans and clips presence to the window', () => {
    expect(presenceSeconds(windows, [at('2027-03-10T07:30:00Z')])).toBe(0);
    // Entry 10 minutes early (within the grace) counts from the start.
    expect(presenceSeconds(windows, [at('2027-03-10T06:50:00Z'), at('2027-03-10T08:00:00Z')])).toBe(
      60 * 60,
    );
    // Scans far outside the window are ignored.
    expect(presenceSeconds(windows, [at('2027-03-10T05:00:00Z'), at('2027-03-10T07:30:00Z')])).toBe(
      0,
    );
  });

  it('never reports more presence than the scheduled duration, whatever the scans', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -3600, max: 4 * 3600 }), { maxLength: 8 }),
        (offsets) => {
          const scans = offsets.map((s) => at('2027-03-10T07:00:00Z').add({ seconds: s }));
          expect(presenceSeconds(windows, scans)).toBeLessThanOrEqual(7200);
          expect(presenceSeconds(windows, scans)).toBeGreaterThanOrEqual(0);
        },
      ),
    );
  });
});

describe('multi-day events', () => {
  // 09:00–18:00 Istanbul on three days.
  const windows = scheduledWindows(at('2027-04-01T06:00:00Z'), at('2027-04-03T15:00:00Z'));

  it('repeat the daily clock window instead of counting nights', () => {
    expect(windows).toHaveLength(3);
    expect(requiredPresenceSeconds(windows)).toBe((3 * 9 * 3600) / 2);
  });

  it('sum presence per day', () => {
    const scans = [
      at('2027-04-01T06:00:00Z'),
      at('2027-04-01T15:00:00Z'), // day 1: 9 h
      at('2027-04-02T06:00:00Z'),
      at('2027-04-02T10:30:00Z'), // day 2: 4.5 h
    ];
    expect(presenceSeconds(windows, scans)).toBe(13.5 * 3600);
    expect(hasAttended(windows, scans)).toBe(true);
    expect(hasAttended(windows, scans.slice(0, 2))).toBe(false);
  });

  it('treat an overnight event as one continuous span', () => {
    const overnight = scheduledWindows(at('2027-04-01T19:00:00Z'), at('2027-04-02T03:00:00Z')); // 22:00–06:00
    expect(overnight).toHaveLength(1);
    expect(requiredPresenceSeconds(overnight)).toBe(4 * 3600);
  });
});
