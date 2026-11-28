import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Short-lived, server-signed attendance token shown as a QR code.
 * Format: base64url(JSON payload) "." base64url(HMAC-SHA256(payload)).
 * The algorithm is fixed (never taken from the token) and signatures are
 * compared in constant time.
 */

export type ScanKind = 'entry' | 'exit' | 'spot_check';

const payloadSchema = z.strictObject({
  e: z.uuid(), // event public id
  k: z.enum(['entry', 'exit', 'spot_check']),
  j: z.string().regex(/^[A-Za-z0-9_-]{22}$/), // token id (jti)
  x: z.number().int().positive(), // expiry, epoch seconds
});

export interface QrClaims {
  eventId: string;
  kind: ScanKind;
  tokenId: string;
  expiresAtSeconds: number;
}

export type QrVerification =
  | { ok: true; claims: QrClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' }
  | { ok: false; reason: 'token_expired' | 'token_wrong_event'; claims: QrClaims };

function sign(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(body).digest();
}

export function issueQrToken(
  secret: string,
  input: { eventId: string; kind: ScanKind; nowSeconds: number; lifetimeSeconds: number },
): { token: string; claims: QrClaims } {
  const claims: QrClaims = {
    eventId: input.eventId,
    kind: input.kind,
    tokenId: randomBytes(16).toString('base64url'),
    expiresAtSeconds: input.nowSeconds + input.lifetimeSeconds,
  };
  const body = Buffer.from(
    JSON.stringify({
      e: claims.eventId,
      k: claims.kind,
      j: claims.tokenId,
      x: claims.expiresAtSeconds,
    }),
  ).toString('base64url');
  return { token: `${body}.${sign(secret, body).toString('base64url')}`, claims };
}

export function verifyQrToken(
  secret: string,
  token: string,
  expected: { eventId?: string; nowSeconds: number },
): QrVerification {
  const parts = token.split('.');
  const [body, signature] = parts;
  if (
    parts.length !== 2 ||
    body === undefined ||
    signature === undefined ||
    body === '' ||
    signature === ''
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const given = Buffer.from(signature, 'base64url');
  const wanted = sign(secret, body);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return { ok: false, reason: 'bad_signature' };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) return { ok: false, reason: 'malformed' };
  const claims: QrClaims = {
    eventId: parsed.data.e,
    kind: parsed.data.k,
    tokenId: parsed.data.j,
    expiresAtSeconds: parsed.data.x,
  };
  if (expected.eventId !== undefined && claims.eventId !== expected.eventId) {
    return { ok: false, reason: 'token_wrong_event', claims };
  }
  if (claims.expiresAtSeconds <= expected.nowSeconds) {
    return { ok: false, reason: 'token_expired', claims };
  }
  return { ok: true, claims };
}
