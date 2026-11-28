import { z } from 'zod';
import { tagSchema } from './events.js';

export const NOTIFICATION_TYPES = [
  'vote_result',
  'vote_invitation',
  'application_confirmed',
  'application_promoted',
  'event_reminder',
  'rating_request',
  'reason_request',
  'points_changed',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const OUTBOUND_CHANNELS = ['email', 'whatsapp'] as const;
export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export const outboundChannelSchema = z.enum(OUTBOUND_CHANNELS);

/** Turkish names of the notification types (preferences page). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  vote_result: 'Oylama sonuçları',
  vote_invitation: 'İlgi alanlarıma uygun oylama daveti',
  application_confirmed: 'Başvuru onayı',
  application_promoted: 'Bekleme listesinden yer açılması',
  event_reminder: 'Yaklaşan etkinlik hatırlatması',
  rating_request: 'Değerlendirme talebi',
  reason_request: 'Neden sorusu',
  points_changed: 'Kazanılan ya da kaybedilen puan',
};

/**
 * Defaults when the user has not chosen: e-mail on, WhatsApp off (WhatsApp
 * additionally needs explicit consent and a phone number).
 */
export const defaultPreference = (channel: OutboundChannel): boolean => channel === 'email';

export const notificationPreferenceSchema = z.strictObject({
  channel: outboundChannelSchema,
  type: notificationTypeSchema,
  enabled: z.boolean(),
});

export const notificationPreferenceListSchema = z
  .strictObject({ items: z.array(notificationPreferenceSchema).max(16) })
  .refine(
    (value) =>
      new Set(value.items.map((i) => `${i.channel}:${i.type}`)).size === value.items.length,
    'Her kanal ve tür bir kez gönderilmeli.',
  );

export const notificationListQuerySchema = z.strictObject({
  unread: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const notificationUpdateSchema = z.strictObject({ read: z.literal(true) });

/** Interest tags share the event tag vocabulary. */
export const interestUpdateSchema = z.strictObject({
  selected: z
    .array(tagSchema)
    .max(30)
    .refine((tags) => new Set(tags).size === tags.length, 'Etiketler tekrar etmemeli.'),
});
