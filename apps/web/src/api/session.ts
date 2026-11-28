import { roleSchema } from '@etkinlik/shared';
import { z } from 'zod';

const meSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  role: roleSchema,
  communities: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type Me = z.infer<typeof meSchema>;

const TIMEOUT_MS = 5_000;

/** The signed-in user, or null without a session. Never cached by the service worker. */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const response = await fetch('/api/v1/me', {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Profile request failed with status ${response.status}`);
  }
  return meSchema.parse(await response.json());
}

export async function logout(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok && response.status !== 401) {
    throw new Error(`Logout failed with status ${response.status}`);
  }
}

/** Server-side login (OIDC); returns the user to the current page afterwards. */
export function loginHref(location: Pick<Location, 'pathname' | 'search'>): string {
  const params = new URLSearchParams(location.search);
  params.delete('giris');
  const query = params.toString();
  const returnTo = `${location.pathname}${query === '' ? '' : `?${query}`}`;
  return `/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
}
