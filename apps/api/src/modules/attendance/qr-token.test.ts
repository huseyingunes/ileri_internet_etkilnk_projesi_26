import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { issueQrToken, verifyQrToken } from './qr-token.js';

const secret = 'test-secret-0123456789abcdef0123456789';
const eventIds = fc.uuid({ version: 7 });
const kinds = fc.constantFrom('entry' as const, 'exit' as const, 'spot_check' as const);
const now = fc.integer({ min: 1_700_000_000, max: 2_000_000_000 });
const lifetime = fc.integer({ min: 1, max: 120 });

describe('QR tokens', () => {
  it('verifies every token it issues until it expires', () => {
    fc.assert(
      fc.property(eventIds, kinds, now, lifetime, (eventId, kind, nowSeconds, lifetimeSeconds) => {
        const { token, claims } = issueQrToken(secret, {
          eventId,
          kind,
          nowSeconds,
          lifetimeSeconds,
        });
        const result = verifyQrToken(secret, token, {
          eventId,
          nowSeconds: nowSeconds + lifetimeSeconds - 1,
        });
        expect(result).toEqual({ ok: true, claims });
      }),
    );
  });

  it('rejects expired tokens', () => {
    fc.assert(
      fc.property(
        eventIds,
        now,
        lifetime,
        fc.nat(1000),
        (eventId, nowSeconds, lifetimeSeconds, late) => {
          const { token } = issueQrToken(secret, {
            eventId,
            kind: 'entry',
            nowSeconds,
            lifetimeSeconds,
          });
          const result = verifyQrToken(secret, token, {
            eventId,
            nowSeconds: nowSeconds + lifetimeSeconds + late,
          });
          expect(result.ok).toBe(false);
          expect(!result.ok && result.reason).toBe('token_expired');
        },
      ),
    );
  });

  it('rejects tokens of another event', () => {
    fc.assert(
      fc.property(eventIds, eventIds, now, (a, b, nowSeconds) => {
        fc.pre(a !== b);
        const { token } = issueQrToken(secret, {
          eventId: a,
          kind: 'entry',
          nowSeconds,
          lifetimeSeconds: 30,
        });
        const result = verifyQrToken(secret, token, { eventId: b, nowSeconds });
        expect(!result.ok && result.reason).toBe('token_wrong_event');
      }),
    );
  });

  it('rejects tampered payloads, foreign keys and garbage', () => {
    fc.assert(
      fc.property(
        eventIds,
        now,
        fc.string({ minLength: 1, maxLength: 40 }),
        (eventId, nowSeconds, junk) => {
          const { token } = issueQrToken(secret, {
            eventId,
            kind: 'entry',
            nowSeconds,
            lifetimeSeconds: 30,
          });
          const [body = '', signature = ''] = token.split('.');
          const forged = Buffer.from(
            JSON.stringify({ e: eventId, k: 'exit', j: 'A'.repeat(22), x: nowSeconds + 9999 }),
          ).toString('base64url');
          expect(verifyQrToken(secret, `${forged}.${signature}`, { nowSeconds }).ok).toBe(false);
          expect(verifyQrToken('another-secret-0123456789abcdef', token, { nowSeconds }).ok).toBe(
            false,
          );
          expect(verifyQrToken(secret, junk, { nowSeconds }).ok).toBe(false);
          expect(verifyQrToken(secret, `${body}.`, { nowSeconds }).ok).toBe(false);
        },
      ),
    );
  });
});
