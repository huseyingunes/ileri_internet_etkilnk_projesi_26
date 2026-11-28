import { errorBodySchema, type FieldError } from '@etkinlik/shared';
import type { z } from 'zod';

const TIMEOUT_MS = 10_000;

/** An API error with the server's Turkish message and per-field errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: FieldError[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  fieldError(field: string): string | undefined {
    return this.fieldErrors.find((error) => error.field === field)?.message;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
  return parsed.success
    ? new ApiError(response.status, parsed.data.code, parsed.data.message, parsed.data.fieldErrors)
    : new ApiError(response.status, 'INTERNAL_ERROR', 'Beklenmeyen bir hata oluştu.', []);
}

/** Same-origin JSON call to /api/v1 with a timeout; responses are validated with `schema`. */
export async function api<S extends z.ZodType>(
  schema: S,
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<z.output<S>> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init.body === undefined || init.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined
      ? {}
      : { body: init.body instanceof FormData ? init.body : JSON.stringify(init.body) }),
    signal: init.signal === undefined ? timeout : AbortSignal.any([init.signal, timeout]),
  });
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return schema.parse(undefined);
  return schema.parse(await response.json());
}
