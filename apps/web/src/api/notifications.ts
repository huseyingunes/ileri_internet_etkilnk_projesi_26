import {
  NOTIFICATION_TYPES,
  type NotificationType,
  OUTBOUND_CHANNELS,
  type OutboundChannel,
} from '@etkinlik/shared';
import { z } from 'zod';
import { api } from './client';

const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  link: z.string().optional(),
  readAt: z.string().optional(),
  createdAt: z.string(),
});
export type AppNotification = z.infer<typeof notificationSchema>;

const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number(),
  page: z.object({ nextCursor: z.string().nullable() }),
});

const preferenceSchema = z.object({
  channel: z.enum(OUTBOUND_CHANNELS),
  type: z.enum(NOTIFICATION_TYPES),
  enabled: z.boolean(),
});
export type Preference = z.infer<typeof preferenceSchema>;

const profileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  studentNumber: z.string().optional(),
  phone: z.string().optional(),
});

const consentSchema = z.object({
  kind: z.enum(['location', 'whatsapp', 'photo']),
  granted: z.boolean(),
});
export type ConsentKind = z.infer<typeof consentSchema>['kind'];

export const listNotifications = (unread = false) =>
  api(notificationPageSchema, `/me/notifications?limit=50${unread ? '&unread=true' : ''}`);

export const markNotificationRead = (id: string) =>
  api(z.undefined(), `/me/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { read: true },
  });

export const getPreferences = () =>
  api(z.object({ items: z.array(preferenceSchema) }), '/me/notification-preferences');

export const savePreferences = (items: Preference[]) =>
  api(z.object({ items: z.array(preferenceSchema) }), '/me/notification-preferences', {
    method: 'PUT',
    body: { items },
  });

export const getProfile = () => api(profileSchema, '/me');

export const updatePhone = (phone: string | null) =>
  api(profileSchema, '/me', { method: 'PATCH', body: { phone } });

export const listConsents = () => api(z.object({ items: z.array(consentSchema) }), '/me/consents');

/** Version of the consent texts shown on the profile page. */
export const CONSENT_TEXT_VERSION = '2026-11';

export const setConsent = (kind: ConsentKind, granted: boolean) =>
  granted
    ? api(z.unknown(), `/me/consents/${kind}`, {
        method: 'PUT',
        body: { textVersion: CONSENT_TEXT_VERSION },
      })
    : api(z.undefined(), `/me/consents/${kind}`, { method: 'DELETE' });

const interestsSchema = z.object({ selected: z.array(z.string()), inferred: z.array(z.string()) });

export const getInterests = () => api(interestsSchema, '/me/interests');

export const saveInterests = (selected: string[]) =>
  api(interestsSchema, '/me/interests', { method: 'PUT', body: { selected } });

export type { NotificationType, OutboundChannel };
