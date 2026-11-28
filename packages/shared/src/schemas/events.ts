import { z } from 'zod';
import { Temporal } from '../temporal/temporal.js';
import { publicIdSchema } from './identity.js';

// Mirrors docs/openapi/components/schemas.yaml (Phase 4 subset).

export const categorySchema = z.enum(['science', 'culture', 'sports']);
export type Category = z.infer<typeof categorySchema>;
export const CATEGORIES = categorySchema.options;

export const CATEGORY_LABELS: Record<Category, string> = {
  science: 'Bilim',
  culture: 'Kültür',
  sports: 'Spor',
};

export const eventStatusSchema = z.enum([
  'pending_approval',
  'rejected',
  'pool',
  'scheduled',
  'completed',
  'cancelled',
]);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  pending_approval: 'Onay bekliyor',
  rejected: 'Reddedildi',
  pool: 'Havuzda',
  scheduled: 'Takvimde',
  completed: 'Gerçekleşti',
  cancelled: 'İptal edildi',
};

export const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-zçğıöşü0-9][a-zçğıöşü0-9 -]{0,49}$/,
    'Etiket harf, rakam, boşluk ve tire içerebilir.',
  );

/** RFC 3339 timestamp with offset (e.g. 2026-12-01T13:00:00+03:00). */
export const timestampSchema = z.iso.datetime({ offset: true });

export const locationSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const eventFields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(5000),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  location: locationSchema,
  capacity: z.number().int().min(1).max(100_000),
  attendanceRadiusM: z.number().int().min(1).max(5000),
  qrRefreshSeconds: z.number().int().min(20).max(30),
  participationRequirements: z.string().trim().max(2000),
  tags: z.array(tagSchema).max(10),
};

const endsAfterStart = (value: { startsAt?: string | undefined; endsAt?: string | undefined }) =>
  value.startsAt === undefined ||
  value.endsAt === undefined ||
  Temporal.Instant.compare(
    Temporal.Instant.from(value.endsAt),
    Temporal.Instant.from(value.startsAt),
  ) > 0;

export const eventCreateSchema = z
  .strictObject({
    ...eventFields,
    category: categorySchema,
    organizerCommunityId: publicIdSchema.optional(),
    advisorId: publicIdSchema.optional(),
    participationRequirements: eventFields.participationRequirements.default(''),
    tags: eventFields.tags.default([]),
  })
  .refine(endsAfterStart, { path: ['endsAt'], error: 'Bitiş başlangıçtan sonra olmalı.' });

export const eventUpdateSchema = z
  .strictObject(eventFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmeli.')
  .refine(endsAfterStart, { path: ['endsAt'], error: 'Bitiş başlangıçtan sonra olmalı.' });

export const eventReviewSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((value) => value.decision === 'approve' || value.reason !== undefined, {
    path: ['reason'],
    error: 'Reddetme gerekçesi zorunludur.',
  });

export const eventCancellationSchema = z.strictObject({
  reason: z.string().trim().min(1).max(2000),
});

const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const eventListQuerySchema = z.strictObject({
  status: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(eventStatusSchema).min(1).max(6))
    .optional(),
  category: categorySchema.optional(),
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
  mine: booleanQuery.optional(),
  communityId: publicIdSchema.optional(),
  tag: tagSchema.optional(),
  q: z.string().trim().min(2).max(100).optional(),
});

export const mediaRefSchema = z.strictObject({ mediaId: publicIdSchema });

/** Widths of generated image variants (srcset). */
export const MEDIA_VARIANT_WIDTHS = [320, 640, 1280] as const;
export const MEDIA_VARIANT_FORMATS = ['avif', 'webp'] as const;
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const mediaVariantNameSchema = z.string().regex(/^[1-9][0-9]{1,4}\.(avif|webp|jpeg)$/);
