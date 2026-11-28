import { categorySchema, type Settings, settingsSchema } from '@etkinlik/shared';
import { z } from 'zod';
import { api } from './client';
import { eventSummarySchema } from './events';

const entrySchema = z.object({
  id: z.string(),
  event: eventSummarySchema,
  voteCount: z.number().nullable(),
});

export const ballotSchema = z.object({
  date: z.string(),
  opensAt: z.string(),
  closesAt: z.string(),
  categories: z.object({
    science: z.array(entrySchema),
    culture: z.array(entrySchema),
    sports: z.array(entrySchema),
  }),
  myVotes: z
    .object({
      science: z.string().nullable(),
      culture: z.string().nullable(),
      sports: z.string().nullable(),
    })
    .optional(),
});
export type Ballot = z.infer<typeof ballotSchema>;

export const resultSchema = z.object({
  id: z.string(),
  date: z.string(),
  category: categorySchema,
  status: z.enum(['winner', 'tie_pending', 'below_threshold', 'no_votes']),
  totalVotes: z.number(),
  winner: eventSummarySchema.optional(),
  tiedEventIds: z.array(z.string()),
  entries: z.array(z.object({ event: eventSummarySchema, voteCount: z.number() })),
});
export type VotingResult = z.infer<typeof resultSchema>;

export const getBallot = (date?: string) =>
  api(ballotSchema, `/ballots${date === undefined ? '' : `?date=${encodeURIComponent(date)}`}`);

export const castVote = (ballotEntryId: string) =>
  api(z.object({ category: categorySchema, ballotEntryId: z.string() }), '/votes', {
    method: 'POST',
    body: { ballotEntryId },
  });

export const getResults = (date: string) =>
  api(
    z.object({ items: z.array(resultSchema) }),
    `/voting-results?date=${encodeURIComponent(date)}`,
  );

export const decideTie = (resultId: string, eventId: string) =>
  api(resultSchema, `/voting-results/${encodeURIComponent(resultId)}/tie-decision`, {
    method: 'PUT',
    body: { eventId },
  });

export const setBallot = (date: string, body: Record<'science' | 'culture' | 'sports', string[]>) =>
  api(ballotSchema, `/ballots/${encodeURIComponent(date)}`, { method: 'PUT', body });

export const getSettings = () => api(settingsSchema, '/settings');

export const updateSettings = (body: Partial<Settings>) =>
  api(settingsSchema, '/settings', { method: 'PATCH', body });
