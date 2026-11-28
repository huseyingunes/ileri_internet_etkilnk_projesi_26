import { Temporal } from '../temporal/temporal.js';
import type { PlainDate } from '../temporal/temporal.js';

/** Situations of the point table (prompt section 3). */
export const SCORE_RULE_CODES = [
  'voted_winner_attended',
  'voted_winner_absent',
  'no_vote_attended',
  'voted_other_attended',
  'voted_other_absent',
  'no_vote_absent',
] as const;
export type ScoreRuleCode = (typeof SCORE_RULE_CODES)[number];
export type LedgerRuleCode = ScoreRuleCode | 'excuse_reversal';

export const DEFAULT_SCORE_POINTS: Readonly<Record<ScoreRuleCode, number>> = {
  voted_winner_attended: 20,
  voted_winner_absent: -20,
  no_vote_attended: 10,
  voted_other_attended: 30,
  voted_other_absent: 0,
  no_vote_absent: 0,
};

export const STARTING_POINTS = 1500;

/** The student's vote in the winning event's day and category. */
export type VoteChoice = 'winner' | 'other' | 'none';

/** Final attendance; `none` = the student never applied. */
export type AttendanceOutcome = 'attended' | 'absent' | 'excused' | 'blocked_by_capacity' | 'none';

/**
 * Which rule applies to a student for a completed winning event, or null when
 * the event must not change the student's points:
 * - an approved excuse or a full event (waiting list) never costs points;
 * - students who neither voted nor applied are not affected.
 */
export function scoreRuleFor(
  vote: VoteChoice,
  attendance: AttendanceOutcome,
): ScoreRuleCode | null {
  if (attendance === 'excused' || attendance === 'blocked_by_capacity') return null;
  if (attendance === 'attended') {
    if (vote === 'winner') return 'voted_winner_attended';
    if (vote === 'other') return 'voted_other_attended';
    return 'no_vote_attended';
  }
  if (vote === 'winner') return 'voted_winner_absent';
  if (vote === 'other') return 'voted_other_absent';
  return attendance === 'absent' ? 'no_vote_absent' : null;
}

export interface Participant<Id> {
  studentId: Id;
  vote: VoteChoice;
  attendance: AttendanceOutcome;
}

export interface PlannedEntry<Id> {
  studentId: Id;
  ruleCode: ScoreRuleCode;
  points: number;
}

/**
 * Ledger entries for one completed event: at most one per student, and only
 * non-zero ones (a 0-point rule leaves no trace in the history).
 */
export function planEventScoring<Id>(
  participants: readonly Participant<Id>[],
  points: Readonly<Record<ScoreRuleCode, number>>,
): PlannedEntry<Id>[] {
  const seen = new Set<Id>();
  const entries: PlannedEntry<Id>[] = [];
  for (const p of participants) {
    if (seen.has(p.studentId)) continue;
    seen.add(p.studentId);
    const ruleCode = scoreRuleFor(p.vote, p.attendance);
    if (ruleCode === null) continue;
    const value = points[ruleCode];
    if (value !== 0) entries.push({ studentId: p.studentId, ruleCode, points: value });
  }
  return entries;
}

/**
 * Points that compensate an event's losses when an excuse is approved after
 * scoring: the negation of the negative entries, or 0 when nothing was lost
 * or the loss was already reversed.
 */
export function excuseReversalPoints(
  entries: readonly { ruleCode: LedgerRuleCode; points: number }[],
): number {
  if (entries.some((e) => e.ruleCode === 'excuse_reversal')) return 0;
  const lost = entries.reduce((sum, e) => sum + Math.min(e.points, 0), 0);
  return lost === 0 ? 0 : -lost;
}

/** Season total: starting points plus the sum of the ledger. */
export const seasonTotal = (startingPoints: number, entries: readonly { points: number }[]) =>
  entries.reduce((sum, e) => sum + e.points, startingPoints);

export interface AcademicSeason {
  name: string;
  startsOn: PlainDate;
  endsOn: PlainDate;
}

/** Academic year containing the date: 1 September – 31 August. */
export function academicSeasonOf(date: PlainDate): AcademicSeason {
  const startYear = date.month >= 9 ? date.year : date.year - 1;
  return {
    name: `${String(startYear)}-${String(startYear + 1)}`,
    startsOn: Temporal.PlainDate.from({ year: startYear, month: 9, day: 1 }),
    endsOn: Temporal.PlainDate.from({ year: startYear + 1, month: 8, day: 31 }),
  };
}
