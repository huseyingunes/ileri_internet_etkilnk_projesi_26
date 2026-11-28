import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { RateLimit, windowOf } from './rate-limit.js';

describe('windowOf', () => {
  it('always resets within (0, window] seconds and is stable inside a window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000 }),
        fc.integer({ min: 1, max: 86_400 }),
        (now, size) => {
          const { index, resetSeconds } = windowOf(now, size);
          expect(resetSeconds).toBeGreaterThan(0);
          expect(resetSeconds).toBeLessThanOrEqual(size);
          expect(windowOf(now + resetSeconds - 1, size).index).toBe(index);
          expect(windowOf(now + resetSeconds, size).index).toBe(index + 1);
        },
      ),
    );
  });
});

describe('RateLimit policy validation', () => {
  it.each([0, -1, 1.5])('rejects limit %s', (limit) => {
    expect(() => RateLimit({ name: 'votes', limit, windowSeconds: 60, by: 'user' })).toThrow();
  });

  it('rejects a zero window', () => {
    expect(() => RateLimit({ name: 'votes', limit: 10, windowSeconds: 0, by: 'user' })).toThrow();
  });
});
