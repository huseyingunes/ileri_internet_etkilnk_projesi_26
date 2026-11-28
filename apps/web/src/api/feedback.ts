import { z } from 'zod';
import { api } from './client';
import { eventSchema, eventSummarySchema, mediaSchema, pageOf } from './events';
import { resultSchema } from './voting';

export const archiveSchema = z.object({
  event: eventSchema,
  participantCount: z.number(),
  averageRating: z.number().nullable().optional(),
  ratingCount: z.number().optional(),
  voting: z.array(resultSchema),
  photos: z.array(mediaSchema),
  viewer: z.object({ canRate: z.boolean(), rated: z.boolean() }).optional(),
});
export type Archive = z.infer<typeof archiveSchema>;

const ratingSchema = z.object({
  score: z.number(),
  comment: z.string().optional(),
  createdAt: z.string(),
});

const ratingReportSchema = pageOf(ratingSchema).extend({
  averageRating: z.number().nullable(),
  ratingCount: z.number(),
});

const reasonPromptSchema = z.object({
  id: z.string(),
  event: eventSummarySchema,
  kind: z.enum(['why_attended', 'why_not_attended']),
  question: z.string(),
  sentAt: z.string(),
  answeredAt: z.string().optional(),
});
export type ReasonPrompt = z.infer<typeof reasonPromptSchema>;

const path = (eventId: string) => `/events/${encodeURIComponent(eventId)}`;

export const getArchive = (eventId: string) => api(archiveSchema, `${path(eventId)}/summary`);

export const rateEvent = (eventId: string, body: { score: number; comment?: string }) =>
  api(ratingSchema, `${path(eventId)}/ratings`, { method: 'POST', body });

export const getRatings = (eventId: string) =>
  api(ratingReportSchema, `${path(eventId)}/ratings?limit=100`);

export const addPhoto = (eventId: string, mediaId: string) =>
  api(z.undefined(), `${path(eventId)}/photos`, { method: 'POST', body: { mediaId } });

export const removePhoto = (eventId: string, mediaId: string) =>
  api(z.undefined(), `${path(eventId)}/photos/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE',
  });

export const listReasonPrompts = () =>
  api(z.object({ items: z.array(reasonPromptSchema) }), '/me/reason-prompts');

export const answerReasonPrompt = (id: string, answer: string) =>
  api(z.undefined(), `/reason-prompts/${encodeURIComponent(id)}/answer`, {
    method: 'PUT',
    body: { answer },
  });
