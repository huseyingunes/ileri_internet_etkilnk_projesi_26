import type { IncomingMessage } from 'node:http';

/**
 * Minimal cookie parsing (no dependency). Returns a Map so attacker-controlled
 * names can never collide with Object prototype keys.
 */
export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (header === undefined || header.length > 8192) {
    return cookies;
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name !== '' && !cookies.has(name)) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  return parseCookies(req.headers.cookie).get(name);
}

export interface CookieOptions {
  maxAgeSeconds?: number;
  sameSite: 'Lax' | 'Strict';
}

/** `__Host-` cookies must be Secure, Path=/ and carry no Domain attribute. */
export function serializeHostCookie(name: string, value: string, options: CookieOptions): string {
  if (!name.startsWith('__Host-')) {
    throw new Error('Only __Host- prefixed cookies are issued');
  }
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'Secure',
    'HttpOnly',
    `SameSite=${options.sameSite}`,
  ];
  if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  }
  return parts.join('; ');
}

export function expireHostCookie(name: string): string {
  return serializeHostCookie(name, '', { sameSite: 'Lax', maxAgeSeconds: 0 });
}
