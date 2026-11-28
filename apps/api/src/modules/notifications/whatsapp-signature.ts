import { createHmac, timingSafeEqual } from 'node:crypto';

const HEADER = /^sha256=([0-9a-f]{64})$/;

/**
 * Verifies Meta's `X-Hub-Signature-256` header: HMAC-SHA256 of the raw body
 * with the app secret. The algorithm is fixed (never taken from the request)
 * and the comparison runs in constant time.
 */
export function verifyWhatsAppSignature(
  appSecret: string,
  rawBody: Buffer,
  header: string | undefined,
): boolean {
  const match = HEADER.exec(header ?? '');
  const given = match?.[1];
  if (given === undefined) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const received = Buffer.from(given, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Constant-time comparison of the webhook verification token. */
export function verifyToken(expected: string, given: string | undefined): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given ?? '');
  return a.length === b.length && timingSafeEqual(a, b);
}
