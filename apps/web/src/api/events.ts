import { categorySchema, eventStatusSchema, roleSchema } from '@etkinlik/shared';
import { z } from 'zod';
import { api } from './client';

export const mediaSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'ready', 'failed']),
  width: z.number().optional(),
  height: z.number().optional(),
  alt: z.string().default(''),
  variants: z.array(
    z.object({
      url: z.string(),
      format: z.enum(['avif', 'webp', 'jpeg']),
      width: z.number(),
      height: z.number(),
    }),
  ),
});
export type Media = z.infer<typeof mediaSchema>;

export const applicationSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  status: z.enum(['confirmed', 'waitlisted', 'cancelled']),
  waitlistPosition: z.number().optional(),
  appliedAt: z.string(),
});
export type Application = z.infer<typeof applicationSchema>;

const userSummarySchema = z.object({ id: z.string(), displayName: z.string(), role: roleSchema });

export const eventSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: categorySchema,
  status: eventStatusSchema,
  startsAt: z.string(),
  endsAt: z.string(),
  location: z.object({ name: z.string(), latitude: z.number(), longitude: z.number() }),
  organizer: z.object({ kind: z.enum(['user', 'community']), id: z.string(), name: z.string() }),
  capacity: z.number(),
  cover: mediaSchema.optional(),
  tags: z.array(z.string()),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

export const eventSchema = eventSummarySchema.extend({
  description: z.string(),
  participationRequirements: z.string(),
  advisor: userSummarySchema.optional(),
  attendanceRadiusM: z.number(),
  qrRefreshSeconds: z.number(),
  rejectionReason: z.string().optional(),
  cancellationReason: z.string().optional(),
  createdAt: z.string(),
  confirmedCount: z.number().default(0),
  waitlistCount: z.number().default(0),
  viewer: z.object({
    canEdit: z.boolean(),
    canReview: z.boolean(),
    canManagePhotos: z.boolean(),
    application: applicationSchema.optional(),
  }),
});
export type EventDetail = z.infer<typeof eventSchema>;

const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), page: z.object({ nextCursor: z.string().nullable() }) });

export const eventPageSchema = pageOf(eventSummarySchema);

export const listEvents = (query: URLSearchParams, signal?: AbortSignal) =>
  api(eventPageSchema, `/events?${query.toString()}`, signal === undefined ? {} : { signal });

export const getEvent = (id: string, signal?: AbortSignal) =>
  api(eventSchema, `/events/${encodeURIComponent(id)}`, signal === undefined ? {} : { signal });

export const createEvent = (body: unknown) => api(eventSchema, '/events', { method: 'POST', body });

export const reviewEvent = (
  id: string,
  body: { decision: 'approve' | 'reject'; reason?: string },
) => api(eventSchema, `/events/${encodeURIComponent(id)}/review`, { method: 'PUT', body });

export const cancelEvent = (id: string, reason: string) =>
  api(eventSchema, `/events/${encodeURIComponent(id)}/cancellation`, {
    method: 'PUT',
    body: { reason },
  });

export const setCover = (id: string, mediaId: string) =>
  api(eventSchema, `/events/${encodeURIComponent(id)}/cover`, { method: 'PUT', body: { mediaId } });

export const listAdvisors = () => api(z.object({ items: z.array(userSummarySchema) }), '/advisors');

export function uploadImage(file: File, alt: string) {
  const form = new FormData();
  form.set('file', file);
  form.set('alt', alt);
  return api(mediaSchema, '/media', { method: 'POST', body: form });
}

export const getMedia = (id: string) => api(mediaSchema, `/media/${encodeURIComponent(id)}`);

export const applyToEvent = (id: string) =>
  api(applicationSchema, `/events/${encodeURIComponent(id)}/applications`, { method: 'POST' });

export const cancelApplication = (id: string) =>
  api(z.undefined(), `/applications/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const myApplications = () =>
  api(
    z.object({
      items: z.array(applicationSchema.extend({ event: eventSummarySchema })),
      page: z.object({ nextCursor: z.string().nullable() }),
    }),
    '/me/applications?limit=50',
  );
