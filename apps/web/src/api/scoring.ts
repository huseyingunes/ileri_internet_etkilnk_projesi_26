import { SCORE_RULE_CODES, type ScoreRuleCode } from '@etkinlik/shared';
import { z } from 'zod';
import { api } from './client';
import { eventSummarySchema, pageOf, userSummarySchema } from './events';

const ruleCodeSchema = z.enum(SCORE_RULE_CODES);

export const scoreSummarySchema = z.object({
  season: z.string(),
  points: z.number(),
  rank: z.number().nullable(),
  attendedCount: z.number(),
  votedCount: z.number(),
  attendanceRateAfterVoting: z.number().nullable(),
});
export type ScoreSummary = z.infer<typeof scoreSummarySchema>;

const scoreEntrySchema = z.object({
  event: eventSummarySchema,
  ruleCode: z.union([ruleCodeSchema, z.literal('excuse_reversal')]),
  points: z.number(),
  createdAt: z.string(),
});

const seasonSchema = z.object({
  name: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  status: z.enum(['active', 'closed']),
});

const leaderboardSchema = z.object({
  season: seasonSchema,
  entries: z.array(
    z.object({
      rank: z.number(),
      student: userSummarySchema,
      points: z.number(),
      attendedCount: z.number(),
    }),
  ),
  me: scoreSummarySchema.optional(),
});

const ruleSchema = z.object({ code: ruleCodeSchema, points: z.number(), validFrom: z.string() });

export const excuseSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  student: userSummarySchema,
  reason: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  reviewedAt: z.string().optional(),
  createdAt: z.string(),
});
export type Excuse = z.infer<typeof excuseSchema>;

/** Turkish descriptions of the point table rows (prompt section 3). */
export const RULE_LABELS: Record<ScoreRuleCode | 'excuse_reversal', string> = {
  voted_winner_attended: 'Oy verdiği etkinlik kazandı ve katıldı',
  voted_winner_absent: 'Oy verdiği etkinlik kazandı ama katılmadı',
  no_vote_attended: 'Oy kullanmadı ama kazanan etkinliğe katıldı',
  voted_other_attended: 'Başka etkinliğe oy verdi ve kazanan etkinliğe katıldı',
  voted_other_absent: 'Başka etkinliğe oy verdi ve kazanan etkinliğe katılmadı',
  no_vote_absent: 'Oy kullanmadı ve katılmadı',
  excuse_reversal: 'Onaylanan mazeret (puan iadesi)',
};

const seasonParam = (season: string | undefined) =>
  season === undefined ? '' : `season=${encodeURIComponent(season)}`;

export const getMyScore = (season?: string) =>
  api(scoreSummarySchema, `/me/score?${seasonParam(season)}`);

export const getMyScoreEntries = (season?: string, cursor?: string) =>
  api(
    pageOf(scoreEntrySchema),
    `/me/score-entries?${[seasonParam(season), cursor === undefined ? '' : `cursor=${encodeURIComponent(cursor)}`].filter((p) => p !== '').join('&')}`,
  );

export const listSeasons = () => api(z.object({ items: z.array(seasonSchema) }), '/seasons');

export const getLeaderboard = (season?: string) =>
  api(leaderboardSchema, `/leaderboard?${seasonParam(season)}`);

export const listScoreRules = () => api(z.object({ items: z.array(ruleSchema) }), '/score-rules');

export const updateScoreRule = (code: ScoreRuleCode, points: number) =>
  api(ruleSchema, `/score-rules/${code}`, { method: 'PUT', body: { points } });

export const submitExcuse = (eventId: string, reason: string) =>
  api(excuseSchema, `/events/${encodeURIComponent(eventId)}/excuses`, {
    method: 'POST',
    body: { reason },
  });

export const listExcuses = (eventId: string) =>
  api(pageOf(excuseSchema), `/events/${encodeURIComponent(eventId)}/excuses?limit=100`);

export const reviewExcuse = (excuseId: string, decision: 'approve' | 'reject') =>
  api(excuseSchema, `/excuses/${encodeURIComponent(excuseId)}`, {
    method: 'PATCH',
    body: { decision },
  });
