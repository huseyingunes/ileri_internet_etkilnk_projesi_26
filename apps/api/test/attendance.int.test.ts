import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { issueQrToken } from '../src/modules/attendance/qr-token.js';
import { call, startTestApp, type TestApp } from './support/app.js';
import type { TestBrowser } from './support/browser.js';

let t: TestApp;
let admin: TestBrowser & { userId: bigint };
let advisor: TestBrowser & { userId: bigint };
const SECRET = 'qr-test-secret-0123456789abcdef0123';
const HERE = { latitude: 41.0, longitude: 29.0 };
const minutes = (m: number) => new Date(Date.now() + m * 60_000);

beforeAll(async () => {
  t = await startTestApp();
  admin = await t.loginAs('admin');
  advisor = await t.loginAs('advisor');
}, 300_000);

afterAll(async () => {
  await t.stop();
});

/** A calendar event between the given offsets (minutes from now), advised by `advisor`. */
async function event(startMin: number, endMin: number): Promise<{ id: string; internal: bigint }> {
  const created = await call(t, admin, 'POST', '/events', {
    title: `Katılım ${Math.random().toString(36).slice(2, 7)}`,
    description: 'x',
    category: 'science',
    startsAt: '2030-01-01T10:00:00+03:00',
    endsAt: '2030-01-01T12:00:00+03:00',
    location: { name: 'Amfi', ...HERE },
    capacity: 50,
    attendanceRadiusM: 100,
    qrRefreshSeconds: 25,
  });
  const id = String(created.body['id']);
  const row = await t.db.prisma.events.update({
    where: { public_id: id },
    data: {
      status: 'scheduled',
      starts_at: minutes(startMin),
      ends_at: minutes(endMin),
      advisor_user_id: advisor.userId,
    },
  });
  return { id, internal: row.id };
}

async function confirmedStudent(eventId: bigint, index: number, status = 'confirmed') {
  const student = await t.loginAs('student', index);
  await t.db.prisma.applications.create({
    data: {
      event_id: eventId,
      student_user_id: student.userId,
      status,
      confirmed_at: status === 'confirmed' ? new Date() : null,
      waitlist_position: status === 'waitlisted' ? 1 : null,
    },
  });
  return student;
}

const grantLocation = (s: TestBrowser) =>
  call(t, s, 'PUT', '/me/consents/location', { textVersion: '2026-11' });

describe('QR codes', () => {
  it('are shown only by the event advisor or an admin, during the event', async () => {
    const ongoing = await event(-30, 90);
    const qr = await call(t, advisor, 'GET', `/events/${ongoing.id}/qr-token?kind=entry`);
    expect(qr.status).toBe(200);
    expect(String(qr.body['url'])).toMatch(/^https:\/\/etkinlik\.test\/katilim#t=[\w-]+\.[\w-]+$/);
    expect(qr.body['refreshAfterSeconds']).toBe(25);

    const otherAdvisor = await t.loginAs('advisor', 1);
    expect((await call(t, otherAdvisor, 'GET', `/events/${ongoing.id}/qr-token`)).status).toBe(403);
    const later = await event(600, 700);
    expect((await call(t, advisor, 'GET', `/events/${later.id}/qr-token`)).status).toBe(409);
  });
});

describe('scanning', () => {
  it('verifies token, consent, application, radius and time, idempotently and without storing coordinates', async () => {
    const ongoing = await event(-30, 90);
    const student = await confirmedStudent(ongoing.internal, 0);
    const qr = await call(t, advisor, 'GET', `/events/${ongoing.id}/qr-token`);
    const token = String(qr.body['url']).split('#t=')[1] ?? '';
    const scan = (s: TestBrowser, body: Record<string, unknown>) =>
      call(t, s, 'POST', '/attendance-scans', { token, accuracyM: 15, ...HERE, ...body });

    expect((await scan(student, {})).status).toBe(403); // no location consent yet
    await grantLocation(student);
    const accepted = await scan(student, { latitude: 41.0004 }); // ~44 m away
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({
      accepted: true,
      kind: 'entry',
      requiredPresenceSeconds: 3600,
    });
    expect(Number(accepted.body['distanceM'])).toBeLessThan(100);

    const again = await scan(student, { latitude: 45 });
    expect(again.body['scannedAt']).toBe(accepted.body['scannedAt']); // same token → same result
    expect(again.body['accepted']).toBe(true);

    const columns = await t.db.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'attendance_scans'`;
    expect(columns.map((c) => c.column_name).some((c) => /lat|lon|coord/.test(c))).toBe(false);

    // Far away with a fresh token: recorded but rejected.
    const second = await call(t, advisor, 'GET', `/events/${ongoing.id}/qr-token?kind=exit`);
    const far = await call(t, student, 'POST', '/attendance-scans', {
      token: String(second.body['url']).split('#t=')[1],
      latitude: 41.01,
      longitude: 29,
      accuracyM: 10,
    });
    expect(far.body).toMatchObject({ accepted: false, rejectionReason: 'outside_radius' });
  });

  it('rejects tampered, expired and foreign tokens and students without a confirmed seat', async () => {
    const ongoing = await event(-30, 90);
    const student = await confirmedStudent(ongoing.internal, 1);
    await grantLocation(student);

    const tampered = await call(t, student, 'POST', '/attendance-scans', {
      token: 'aaaaaaaaaaaaaaaa.bbbbbbbb',
      accuracyM: 5,
      ...HERE,
    });
    expect(tampered.status).toBe(422);

    const { token: expired } = issueQrToken(SECRET, {
      eventId: ongoing.id,
      kind: 'entry',
      nowSeconds: Math.floor(Date.now() / 1000) - 600,
      lifetimeSeconds: 50,
    });
    const late = await call(t, student, 'POST', '/attendance-scans', {
      token: expired,
      accuracyM: 5,
      ...HERE,
    });
    expect(late.body).toMatchObject({ accepted: false, rejectionReason: 'token_expired' });

    const { token: forged } = issueQrToken('attacker-secret-0123456789abcdef0123', {
      eventId: ongoing.id,
      kind: 'entry',
      nowSeconds: Math.floor(Date.now() / 1000),
      lifetimeSeconds: 50,
    });
    expect(
      (
        await call(t, student, 'POST', '/attendance-scans', {
          token: forged,
          accuracyM: 5,
          ...HERE,
        })
      ).status,
    ).toBe(422);

    const outsider = await t.loginAs('student', 2);
    await grantLocation(outsider);
    const qr = await call(t, advisor, 'GET', `/events/${ongoing.id}/qr-token`);
    const noSeat = await call(t, outsider, 'POST', '/attendance-scans', {
      token: String(qr.body['url']).split('#t=')[1],
      accuracyM: 5,
      ...HERE,
    });
    expect(noSeat.status).toBe(409);
  });
});

describe('finalization', () => {
  it('applies the 50% rule, marks waiting-list students and completes the event once', async () => {
    const ended = await event(-140, -20); // 120-minute event that ended 20 minutes ago
    const present = await confirmedStudent(ended.internal, 3);
    const partial = await confirmedStudent(ended.internal, 4);
    const waiting = await confirmedStudent(ended.internal, 5, 'waitlisted');
    const scan = (studentId: bigint, atMin: number, n: number) =>
      t.db.prisma.attendance_scans.create({
        data: {
          event_id: ended.internal,
          student_user_id: studentId,
          kind: 'entry',
          token_id: `tok${n.toString().padStart(8, '0')}`,
          scanned_at: minutes(atMin),
          distance_m: 10,
          within_radius: true,
          accepted: true,
        },
      });
    await scan(present.userId, -140, 1);
    await scan(present.userId, -75, 2); // 65 of 120 minutes
    await scan(partial.userId, -140, 3);
    await scan(partial.userId, -90, 4); // 50 of 120 minutes

    const service = t.app.get(AttendanceService);
    expect(await service.finalizeDueEvents()).toContain(ended.internal);
    expect(await service.finalizeDueEvents()).not.toContain(ended.internal);

    const rows = await t.db.prisma.attendances.findMany({ where: { event_id: ended.internal } });
    const statusOf = (id: bigint) => rows.find((r) => r.student_user_id === id)?.status;
    expect(statusOf(present.userId)).toBe('attended');
    expect(statusOf(partial.userId)).toBe('absent');
    expect(statusOf(waiting.userId)).toBe('blocked_by_capacity');
    const completed = await t.db.prisma.events.findUniqueOrThrow({ where: { id: ended.internal } });
    expect(completed.status).toBe('completed');

    const list = await call(t, advisor, 'GET', `/events/${ended.id}/attendances`);
    expect((list.body['items'] as { status: string }[]).map((i) => i.status).sort()).toEqual([
      'absent',
      'attended',
      'blocked_by_capacity',
    ]);
  });
});
