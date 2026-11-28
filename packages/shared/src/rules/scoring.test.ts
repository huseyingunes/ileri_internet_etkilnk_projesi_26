import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Temporal } from '../temporal/temporal.js';
import {
  academicSeasonOf,
  type AttendanceOutcome,
  DEFAULT_SCORE_POINTS,
  excuseReversalPoints,
  planEventScoring,
  type ScoreRuleCode,
  scoreRuleFor,
  seasonTotal,
  STARTING_POINTS,
  type VoteChoice,
} from './scoring.js';

const votes = fc.constantFrom<VoteChoice>('winner', 'other', 'none');
const outcomes = fc.constantFrom<AttendanceOutcome>(
  'attended',
  'absent',
  'excused',
  'blocked_by_capacity',
  'none',
);
const point = fc.integer({ min: -1000, max: 1000 });
const pointTables: fc.Arbitrary<Record<ScoreRuleCode, number>> = fc.record({
  voted_winner_attended: point,
  voted_winner_absent: point,
  no_vote_attended: point,
  voted_other_attended: point,
  voted_other_absent: point,
  no_vote_absent: point,
});

describe('scoreRuleFor', () => {
  it('implements the point table of the prompt', () => {
    const table: [VoteChoice, AttendanceOutcome, number][] = [
      ['winner', 'attended', 20],
      ['winner', 'absent', -20],
      ['none', 'attended', 10],
      ['other', 'attended', 30],
      ['other', 'absent', 0],
      ['none', 'absent', 0],
    ];
    for (const [vote, attendance, points] of table) {
      const code = scoreRuleFor(vote, attendance);
      expect(code === null ? 0 : DEFAULT_SCORE_POINTS[code]).toBe(points);
    }
  });

  it('never costs points for an approved excuse or a full event', () => {
    fc.assert(
      fc.property(votes, (vote) => {
        expect(scoreRuleFor(vote, 'excused')).toBeNull();
        expect(scoreRuleFor(vote, 'blocked_by_capacity')).toBeNull();
      }),
    );
  });

  it('leaves students who neither voted nor applied untouched', () => {
    expect(scoreRuleFor('none', 'none')).toBeNull();
    expect(scoreRuleFor('winner', 'none')).toBe('voted_winner_absent');
  });
});

describe('planEventScoring', () => {
  it('scores each student at most once, never with zero points, and the total equals the ledger', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ studentId: fc.nat({ max: 20 }), vote: votes, attendance: outcomes })),
        pointTables,
        (participants, points) => {
          const entries = planEventScoring(participants, points);
          const ids = entries.map((e) => e.studentId);
          expect(new Set(ids).size).toBe(ids.length);
          for (const e of entries) {
            expect(e.points).not.toBe(0);
            expect(e.points).toBe(points[e.ruleCode]);
          }
          const sum = entries.reduce((s, e) => s + e.points, 0);
          expect(seasonTotal(STARTING_POINTS, entries)).toBe(STARTING_POINTS + sum);
        },
      ),
    );
  });
});

describe('excuseReversalPoints', () => {
  it('restores exactly the points lost, once', () => {
    expect(excuseReversalPoints([{ ruleCode: 'voted_winner_absent', points: -20 }])).toBe(20);
    expect(excuseReversalPoints([{ ruleCode: 'voted_other_attended', points: 30 }])).toBe(0);
    expect(
      excuseReversalPoints([
        { ruleCode: 'voted_winner_absent', points: -20 },
        { ruleCode: 'excuse_reversal', points: 20 },
      ]),
    ).toBe(0);
  });
});

describe('academicSeasonOf', () => {
  it('runs from 1 September to 31 August', () => {
    expect(academicSeasonOf(Temporal.PlainDate.from('2026-09-01')).name).toBe('2026-2027');
    expect(academicSeasonOf(Temporal.PlainDate.from('2026-08-31')).name).toBe('2025-2026');
    const s = academicSeasonOf(Temporal.PlainDate.from('2027-02-28'));
    expect(s.startsOn.toString()).toBe('2026-09-01');
    expect(s.endsOn.toString()).toBe('2027-08-31');
  });

  it('always contains the date', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40_000 }), (offset) => {
        const date = Temporal.PlainDate.from('2000-01-01').add({ days: offset });
        const s = academicSeasonOf(date);
        expect(Temporal.PlainDate.compare(s.startsOn, date)).toBeLessThanOrEqual(0);
        expect(Temporal.PlainDate.compare(date, s.endsOn)).toBeLessThanOrEqual(0);
      }),
    );
  });
});
