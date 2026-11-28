import { z } from 'zod';
import { api } from './client';

export const qrTokenSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
  refreshAfterSeconds: z.number(),
  kind: z.enum(['entry', 'exit', 'spot_check']),
});

export const scanResultSchema = z.object({
  accepted: z.boolean(),
  kind: z.enum(['entry', 'exit', 'spot_check']),
  scannedAt: z.string(),
  distanceM: z.number().optional(),
  rejectionReason: z
    .enum([
      'token_expired',
      'token_wrong_event',
      'outside_radius',
      'location_unavailable',
      'outside_event_time',
    ])
    .optional(),
  presenceSoFarSeconds: z.number(),
  requiredPresenceSeconds: z.number(),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

const consentListSchema = z.object({
  items: z.array(
    z.object({ kind: z.enum(['location', 'whatsapp', 'photo']), granted: z.boolean() }),
  ),
});

export const getQrToken = (eventId: string, kind: string) =>
  api(
    qrTokenSchema,
    `/events/${encodeURIComponent(eventId)}/qr-token?kind=${encodeURIComponent(kind)}`,
  );

export const scanAttendance = (body: {
  token: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
}) => api(scanResultSchema, '/attendance-scans', { method: 'POST', body });

export const listConsents = () => api(consentListSchema, '/me/consents');

/** Version of the location consent text shown on the attendance page. */
export const LOCATION_CONSENT_VERSION = '2026-11';

export const grantLocationConsent = () =>
  api(z.unknown(), '/me/consents/location', {
    method: 'PUT',
    body: { textVersion: LOCATION_CONSENT_VERSION },
  });
