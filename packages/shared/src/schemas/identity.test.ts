import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { meUpdateSchema, returnToSchema, userAdminUpdateSchema } from './identity.js';

describe('returnToSchema', () => {
  it.each(['/', '/etkinlikler', '/etkinlikler/abc?sekme=oy#x'])(
    'accepts relative path %s',
    (path) => {
      expect(returnToSchema.safeParse(path).success).toBe(true);
    },
  );

  it.each([
    'https://evil.example',
    '//evil.example',
    String.raw`/\evil.example`,
    String.raw`\\evil.example`,
    'javascript:alert(1)',
    'etkinlikler',
    '/ x',
  ])('rejects open-redirect candidate %s', (path) => {
    expect(returnToSchema.safeParse(path).success).toBe(false);
  });

  it('never accepts anything that resolves to another origin', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (path) => {
        if (returnToSchema.safeParse(path).success) {
          expect(new URL(path, 'https://haber10da.net').origin).toBe('https://haber10da.net');
        }
      }),
    );
  });
});

describe('update schemas', () => {
  it('reject empty bodies and unknown fields', () => {
    expect(meUpdateSchema.safeParse({}).success).toBe(false);
    expect(userAdminUpdateSchema.safeParse({}).success).toBe(false);
    expect(userAdminUpdateSchema.safeParse({ role: 'admin', extra: 1 }).success).toBe(false);
  });

  it('validates phone numbers as E.164', () => {
    expect(meUpdateSchema.safeParse({ phone: '+905551112233' }).success).toBe(true);
    expect(meUpdateSchema.safeParse({ phone: '05551112233' }).success).toBe(false);
    expect(meUpdateSchema.safeParse({ phone: null }).success).toBe(true);
  });
});
