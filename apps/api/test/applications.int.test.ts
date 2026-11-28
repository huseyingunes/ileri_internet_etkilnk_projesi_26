import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { placement } from '../src/modules/applications/applications.service.js';
import { call, startTestApp, type TestApp } from './support/app.js';
import type { TestBrowser } from './support/browser.js';

let t: TestApp;
let admin: TestBrowser & { userId: bigint };

beforeAll(async () => {
  t = await startTestApp();
  admin = await t.loginAs('admin');
}, 300_000);

afterAll(async () => {
  await t.stop();
});

/** A scheduled (calendar) event, as if it had won a vote. */
async function scheduledEvent(capacity: number, startsInDays = 7): Promise<string> {
  const start = new Date(Date.now() + startsInDays * 86_400_000).toISOString();
  const end = new Date(Date.now() + startsInDays * 86_400_000 + 7_200_000).toISOString();
  const created = await call(t, admin, 'POST', '/events', {
    title: `Takvim etkinliği ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Açıklama',
    category: 'culture',
    startsAt: start,
    endsAt: end,
    location: { name: 'Salon', latitude: 41, longitude: 29 },
    capacity,
    attendanceRadiusM: 100,
    qrRefreshSeconds: 25,
  });
  const id = String(created.body['id']);
  await t.db.prisma.events.update({ where: { public_id: id }, data: { status: 'scheduled' } });
  return id;
}

describe('placement rule', () => {
  it('confirms while seats are free and queues afterwards', () => {
    fc.assert(
      fc.property(
        fc.nat(50),
        fc.integer({ min: 1, max: 50 }),
        fc.option(fc.nat(50), { nil: null }),
        (confirmed, capacity, last) => {
          const place = placement(confirmed, capacity, last);
          if (confirmed < capacity) expect(place).toEqual({ status: 'confirmed', position: null });
          else expect(place).toEqual({ status: 'waitlisted', position: (last ?? 0) + 1 });
        },
      ),
    );
  });
});

describe('applications', () => {
  it('confirms up to capacity, then builds a waiting list and promotes on cancellation', async () => {
    const eventId = await scheduledEvent(2);
    const students = await Promise.all([0, 1, 2, 3].map((i) => t.loginAs('student', i)));
    const applied = [];
    for (const s of students)
      applied.push(await call(t, s, 'POST', `/events/${eventId}/applications`));
    expect(applied.map((a) => a.body['status'])).toEqual([
      'confirmed',
      'confirmed',
      'waitlisted',
      'waitlisted',
    ]);
    expect(applied[3]?.body['waitlistPosition']).toBe(2);

    // Idempotent re-application.
    const again = await call(
      t,
      students[0] as TestBrowser,
      'POST',
      `/events/${eventId}/applications`,
    );
    expect(again.status).toBe(200);
    expect(again.body['id']).toBe(applied[0]?.body['id']);

    // A confirmed student cancels → the first waiting student is promoted.
    expect(
      (
        await call(
          t,
          students[0] as TestBrowser,
          'DELETE',
          `/applications/${String(applied[0]?.body['id'])}`,
        )
      ).status,
    ).toBe(204);
    const promoted = await call(t, students[2] as TestBrowser, 'GET', `/events/${eventId}`);
    expect(
      (promoted.body['viewer'] as { application: { status: string } }).application.status,
    ).toBe('confirmed');
    const stillWaiting = await call(t, students[3] as TestBrowser, 'GET', `/events/${eventId}`);
    expect(
      (stillWaiting.body['viewer'] as { application: { waitlistPosition: number } }).application
        .waitlistPosition,
    ).toBe(1);
    expect(promoted.body['confirmedCount']).toBe(2);
    expect(promoted.body['waitlistCount']).toBe(1);

    // Cancelling again is idempotent; others cannot cancel someone else's application.
    expect(
      (
        await call(
          t,
          students[0] as TestBrowser,
          'DELETE',
          `/applications/${String(applied[0]?.body['id'])}`,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await call(
          t,
          students[1] as TestBrowser,
          'DELETE',
          `/applications/${String(applied[3]?.body['id'])}`,
        )
      ).status,
    ).toBe(403);
  });

  it('never confirms more students than the capacity under concurrent applications', async () => {
    const capacity = 3;
    const eventId = await scheduledEvent(capacity);
    const students = await Promise.all(
      Array.from({ length: 12 }, (_, i) => t.loginAs('student', 10 + i)),
    );
    const results = await Promise.all(
      students.map((s) => call(t, s, 'POST', `/events/${eventId}/applications`)),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const event = await t.db.prisma.events.findUniqueOrThrow({ where: { public_id: eventId } });
    const confirmed = await t.db.prisma.applications.count({
      where: { event_id: event.id, status: 'confirmed' },
    });
    const waiting = await t.db.prisma.applications.findMany({
      where: { event_id: event.id, status: 'waitlisted' },
      orderBy: { waitlist_position: 'asc' },
    });
    expect(confirmed).toBe(capacity);
    expect(waiting.map((w) => w.waitlist_position)).toEqual(
      Array.from({ length: 9 }, (_, i) => i + 1),
    );
  });

  it('accepts applications only for upcoming calendar events and only from students', async () => {
    const pool = await call(t, admin, 'POST', '/events', {
      title: 'Havuzdaki etkinlik',
      description: 'x',
      category: 'sports',
      startsAt: '2027-05-01T10:00:00+03:00',
      endsAt: '2027-05-01T12:00:00+03:00',
      location: { name: 'Saha', latitude: 41, longitude: 29 },
      capacity: 10,
      attendanceRadiusM: 100,
      qrRefreshSeconds: 25,
    });
    const student = await t.loginAs('student', 25);
    expect(
      (await call(t, student, 'POST', `/events/${String(pool.body['id'])}/applications`)).status,
    ).toBe(409);

    const started = await scheduledEvent(10, -1);
    expect((await call(t, student, 'POST', `/events/${started}/applications`)).status).toBe(409);

    const upcoming = await scheduledEvent(10);
    expect((await call(t, admin, 'POST', `/events/${upcoming}/applications`)).status).toBe(403);
  });

  it('lists applications for the event advisor and the student', async () => {
    const eventId = await scheduledEvent(1);
    const student = await t.loginAs('student', 26);
    await call(t, student, 'POST', `/events/${eventId}/applications`);
    const mine = await call(t, student, 'GET', '/me/applications');
    expect(
      (mine.body['items'] as { event: { id: string } }[]).some((a) => a.event.id === eventId),
    ).toBe(true);

    const list = await call(t, admin, 'GET', `/events/${eventId}/applications`);
    expect(list.body['items'] as { student: { id: string } }[]).toHaveLength(1);
    const otherAdvisor = await t.loginAs('advisor', 3);
    expect((await call(t, otherAdvisor, 'GET', `/events/${eventId}/applications`)).status).toBe(
      403,
    );
  });
});
