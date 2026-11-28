import fc from 'fast-check';
import { ROLES } from '@etkinlik/shared';
import { describe, expect, it } from 'vitest';
import { initialRole, removesLastAdmin } from './role-policy.js';

describe('initialRole', () => {
  it('makes the configured initial admin an admin regardless of claims', () => {
    for (const claimedRole of [...ROLES, undefined]) {
      expect(
        initialRole({ email: 'a@uni.example', claimedRole, initialAdminEmail: 'a@uni.example' }),
      ).toBe('admin');
    }
  });

  it('defaults to student without a role claim', () => {
    expect(
      initialRole({
        email: 'x@uni.example',
        claimedRole: undefined,
        initialAdminEmail: 'a@uni.example',
      }),
    ).toBe('student');
  });
});

describe('removesLastAdmin', () => {
  it('never allows the active admin count to reach zero', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROLES),
        fc.constantFrom(...ROLES),
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        (currentRole, nextRole, currentlyActive, nextActive, activeAdminCount) => {
          const blocked = removesLastAdmin({
            currentRole,
            nextRole,
            currentlyActive,
            nextActive,
            activeAdminCount,
          });
          const before = activeAdminCount;
          const wasCounted = currentRole === 'admin' && currentlyActive;
          const isCounted = nextRole === 'admin' && nextActive;
          const after = before - (wasCounted ? 1 : 0) + (isCounted ? 1 : 0);
          if (wasCounted && before >= 1 && after === 0) {
            expect(blocked).toBe(true);
          }
          if (!wasCounted || isCounted) {
            expect(blocked).toBe(false);
          }
        },
      ),
    );
  });
});
