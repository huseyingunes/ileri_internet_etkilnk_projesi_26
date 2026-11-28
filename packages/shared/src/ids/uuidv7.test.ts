import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { uuidv7 } from './uuidv7.js';

const uuidV7Schema = z.uuid({ version: 'v7' });
const maxTimestamp = 2 ** 48 - 1;

describe('uuidv7', () => {
  it('always produces a valid RFC 9562 version 7 UUID', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: maxTimestamp }),
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        (ms, random) => {
          expect(uuidV7Schema.safeParse(uuidv7(ms, random)).success).toBe(true);
        },
      ),
    );
  });

  it('encodes the timestamp so ids sort by creation time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: maxTimestamp - 1 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (ms, delta) => {
          const later = Math.min(ms + delta, maxTimestamp);
          expect(uuidv7(ms) < uuidv7(later)).toBe(true);
        },
      ),
    );
  });

  it('rejects negative or unsafe timestamps', () => {
    expect(() => uuidv7(-1)).toThrow(RangeError);
    expect(() => uuidv7(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});
