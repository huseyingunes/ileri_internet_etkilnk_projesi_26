import fc from 'fast-check';
import { eventStatusSchema, ROLES } from '@etkinlik/shared';
import { describe, expect, it } from 'vitest';
import {
  canCancel,
  canEdit,
  canManagePhotos,
  canReview,
  canView,
  type EventFacts,
  initialStatus,
} from './event-policy.js';

const ids = fc.bigInt({ min: 1n, max: 5n });
const facts = fc.record({
  status: fc.constantFrom(...eventStatusSchema.options),
  createdBy: ids,
  advisor: fc.option(ids, { nil: null }),
});
const caller = fc.record({ userId: ids, role: fc.constantFrom(...ROLES) });

describe('event policy', () => {
  it('lets nobody edit, review or cancel finished or cancelled events', () => {
    fc.assert(
      fc.property(facts, caller, (event, who) => {
        if (event.status === 'completed' || event.status === 'cancelled') {
          expect(canEdit(event, who)).toBe(false);
          expect(canReview(event, who)).toBe(false);
          expect(canCancel(event, who)).toBe(false);
        }
      }),
    );
  });

  it('never lets students review, cancel or manage photos', () => {
    fc.assert(
      fc.property(facts, ids, (event, userId) => {
        const student = { userId, role: 'student' as const };
        expect(canReview(event, student)).toBe(false);
        expect(canCancel(event, student)).toBe(false);
        expect(canManagePhotos(event, student)).toBe(false);
      }),
    );
  });

  it('only lets the assigned advisor (or an admin) act as advisor', () => {
    fc.assert(
      fc.property(facts, ids, (event, userId) => {
        const advisor = { userId, role: 'advisor' as const };
        if (event.advisor !== userId) {
          expect(canReview(event, advisor)).toBe(false);
          expect(canCancel(event, advisor)).toBe(false);
        }
      }),
    );
  });

  it('hides unapproved proposals from unrelated students', () => {
    const pending: EventFacts = { status: 'pending_approval', createdBy: 1n, advisor: 2n };
    expect(canView(pending, { userId: 3n, role: 'student' })).toBe(false);
    expect(canView(pending, { userId: 1n, role: 'student' })).toBe(true);
    expect(canView(pending, { userId: 2n, role: 'advisor' })).toBe(true);
    expect(canView(pending, { userId: 9n, role: 'admin' })).toBe(true);
  });

  it('sends student proposals to approval and others to the pool', () => {
    expect(initialStatus('student')).toBe('pending_approval');
    expect(initialStatus('advisor')).toBe('pool');
    expect(initialStatus('admin')).toBe('pool');
  });
});
