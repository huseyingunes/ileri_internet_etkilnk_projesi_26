import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideCategory } from './voting.js';

const tallies = fc.uniqueArray(
  fc.record({ id: fc.integer({ min: 1, max: 1000 }), votes: fc.nat({ max: 500 }) }),
  { minLength: 1, maxLength: 3, selector: (t) => t.id },
);

describe('decideCategory', () => {
  it('always reports the real total and picks only a strict maximum as winner', () => {
    fc.assert(
      fc.property(tallies, fc.integer({ min: 1, max: 50 }), (ts, minimum) => {
        const outcome = decideCategory(ts, minimum);
        const total = ts.reduce((sum, t) => sum + t.votes, 0);
        expect(outcome.total).toBe(total);
        if (outcome.status === 'winner') {
          const winner = ts.find((t) => t.id === outcome.winner);
          expect(winner).toBeDefined();
          for (const t of ts)
            if (t.id !== outcome.winner) expect(t.votes).toBeLessThan(winner?.votes ?? 0);
          expect(total).toBeGreaterThanOrEqual(minimum);
        }
        if (outcome.status === 'tie_pending') {
          expect(outcome.tied.length).toBeGreaterThan(1);
          const top = Math.max(...ts.map((t) => t.votes));
          for (const id of outcome.tied) expect(ts.find((t) => t.id === id)?.votes).toBe(top);
        }
        if (outcome.status === 'below_threshold') expect(total).toBeLessThan(minimum);
        if (outcome.status === 'no_votes') expect(total).toBe(0);
      }),
    );
  });

  it('declares no winner below the threshold even with a clear leader', () => {
    expect(
      decideCategory(
        [
          { id: 1, votes: 2 },
          { id: 2, votes: 0 },
        ],
        5,
      ),
    ).toEqual({ status: 'below_threshold', total: 2 });
  });

  it('leaves exact ties to the administrator', () => {
    expect(
      decideCategory(
        [
          { id: 1, votes: 4 },
          { id: 2, votes: 4 },
          { id: 3, votes: 1 },
        ],
        1,
      ),
    ).toEqual({
      status: 'tie_pending',
      total: 9,
      tied: [1, 2],
    });
  });

  it('rejects a zero or negative threshold', () => {
    expect(() => decideCategory([{ id: 1, votes: 1 }], 0)).toThrow(RangeError);
  });
});
