/**
 * Pure voting rules (prompt section 2 and 3), shared by API and tests.
 */

export interface Tally<Id> {
  id: Id;
  votes: number;
}

export type VotingOutcome<Id> =
  | { status: 'no_votes'; total: 0 }
  | { status: 'below_threshold'; total: number }
  | { status: 'winner'; total: number; winner: Id }
  | { status: 'tie_pending'; total: number; tied: Id[] };

/**
 * Decides one category of one day: the entry with the most votes wins; a tie
 * is left to the administrator; below the minimum threshold nobody wins.
 */
export function decideCategory<Id>(
  tallies: readonly Tally<Id>[],
  minimumVotes: number,
): VotingOutcome<Id> {
  if (!Number.isInteger(minimumVotes) || minimumVotes < 1) {
    throw new RangeError('minimumVotes must be a positive integer');
  }
  const total = tallies.reduce((sum, t) => sum + t.votes, 0);
  if (total === 0) return { status: 'no_votes', total: 0 };
  if (total < minimumVotes) return { status: 'below_threshold', total };
  const top = Math.max(...tallies.map((t) => t.votes));
  const leaders = tallies.filter((t) => t.votes === top).map((t) => t.id);
  const [winner] = leaders;
  if (leaders.length === 1 && winner !== undefined) return { status: 'winner', total, winner };
  return { status: 'tie_pending', total, tied: leaders };
}

/** A ballot needs exactly three distinct events per category. */
export const EVENTS_PER_CATEGORY = 3;
