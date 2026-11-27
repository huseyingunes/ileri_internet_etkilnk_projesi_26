import { z } from 'zod';

/** Single error body returned by every API endpoint. */
export const fieldErrorSchema = z.object({
  field: z.string().min(1),
  message: z.string().min(1),
});

export const errorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fieldErrors: z.array(fieldErrorSchema),
  requestId: z.string().min(1),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ErrorBody = z.infer<typeof errorBodySchema>;

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(PAGE_SIZE_MAX)
  .default(PAGE_SIZE_DEFAULT);

export const healthStatusSchema = z.enum(['ok', 'error']);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  checks: z.record(z.string(), healthStatusSchema),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
