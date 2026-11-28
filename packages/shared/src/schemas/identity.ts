import { z } from 'zod';

// Mirrors docs/openapi/components/schemas.yaml (Phase 3 subset).

export const roleSchema = z.enum(['student', 'advisor', 'admin']);
export type Role = z.infer<typeof roleSchema>;
export const ROLES = roleSchema.options;

export const publicIdSchema = z.uuid({ version: 'v7' });

export const consentKindSchema = z.enum(['location', 'whatsapp', 'photo']);
export type ConsentKind = z.infer<typeof consentKindSchema>;

const phoneSchema = z.string().regex(/^\+[1-9][0-9]{7,14}$/, 'Telefon E.164 biçiminde olmalı.');

/** Only relative, same-origin paths: no scheme, no protocol-relative `//`, no backslashes. */
export const returnToSchema = z
  .string()
  .max(500)
  .regex(/^\/(?![/\\])[^\s\\]*$/, 'Yalnızca göreli bir yol olabilir.');

export const meUpdateSchema = z
  .strictObject({ phone: phoneSchema.nullable() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmeli.');

export const consentGrantSchema = z.strictObject({
  textVersion: z.string().min(1).max(40),
});

export const userAdminUpdateSchema = z
  .strictObject({ role: roleSchema, isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmeli.');

export const userListQuerySchema = z.strictObject({
  role: roleSchema.optional(),
  q: z.string().min(2).max(100).optional(),
});

export const communityCreateSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).default(''),
});

export const communityUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(120),
    description: z.string().max(2000),
    archived: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmeli.');

export const membershipCreateSchema = z.strictObject({ userId: publicIdSchema });

export const searchQuerySchema = z.strictObject({
  q: z.string().min(2).max(100).optional(),
});

export const auditQuerySchema = z.strictObject({
  action: z.string().max(80).optional(),
});

export interface UserSummary {
  id: string;
  displayName: string;
  role: Role;
}

export interface CommunitySummary {
  id: string;
  name: string;
}
