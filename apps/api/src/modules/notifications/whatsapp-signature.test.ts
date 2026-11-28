import { createHmac } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { verifyToken, verifyWhatsAppSignature } from './whatsapp-signature.js';

const SECRET = 'app-secret-0123456789abcdef';
const sign = (body: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('verifyWhatsAppSignature', () => {
  it('accepts exactly the body signed with the app secret', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), fc.uint8Array({ maxLength: 512 }), (a, b) => {
        const body = Buffer.from(a);
        const other = Buffer.from(b);
        expect(verifyWhatsAppSignature(SECRET, body, sign(body))).toBe(true);
        if (!body.equals(other)) {
          expect(verifyWhatsAppSignature(SECRET, other, sign(body))).toBe(false);
        }
      }),
    );
  });

  it('rejects other secrets, algorithms and malformed headers', () => {
    const body = Buffer.from('{"entry":[]}');
    expect(verifyWhatsAppSignature(SECRET, body, sign(body, 'another-secret-0123456789'))).toBe(
      false,
    );
    const sha1 = `sha1=${createHmac('sha1', SECRET).update(body).digest('hex')}`;
    expect(verifyWhatsAppSignature(SECRET, body, sha1)).toBe(false);
    expect(verifyWhatsAppSignature(SECRET, body, undefined)).toBe(false);
    expect(verifyWhatsAppSignature(SECRET, body, 'sha256=abc')).toBe(false);
    expect(verifyWhatsAppSignature(SECRET, body, sign(body).toUpperCase())).toBe(false);
  });
});

describe('verifyToken', () => {
  it('compares exactly', () => {
    expect(verifyToken('verify-token-0123456789', 'verify-token-0123456789')).toBe(true);
    expect(verifyToken('verify-token-0123456789', 'verify-token-012345678')).toBe(false);
    expect(verifyToken('verify-token-0123456789', undefined)).toBe(false);
  });
});
