import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScoringService } from '../src/modules/scoring/scoring.service.js';
import { call, startTestApp, type TestApp } from './support/app.js';
import type { TestBrowser } from './support/browser.js';
import * as scenario from './support/scenario.js';

let t: TestApp;
let admin: TestBrowser & { userId: bigint };
let advisor: TestBrowser & { userId: bigint };

beforeAll(async () => {
  t = await startTestApp();
  admin = await t.loginAs('admin');
  advisor = await t.loginAs('advisor');
}, 300_000);

afterAll(async () => {
  await t.stop();
});

const newEvent = (status: string) => scenario.newEvent(t, admin, advisor, status);
const wonEvent = (
  votes: { student: bigint; forWinner: boolean }[],
  attendance: { student: bigint; status: string }[],
) => scenario.wonEvent(t, admin, advisor, votes, attendance);

const pointsOf = async (s: TestBrowser) => (await call(t, s, 'GET', '/me/score')).body['points'];

describe('scoring a completed winning event', () => {
  it('applies the point table once, without penalising full events', async () => {
    const [a, b, c, d, e, f] = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((i) => t.loginAs('student', i)),
    );
    if (!a || !b || !c || !d || !e || !f) throw new Error('students');
    const event = await wonEvent(
      [
        { student: a.userId, forWinner: true },
        { student: b.userId, forWinner: true },
        { student: c.userId, forWinner: false },
        { student: e.userId, forWinner: true },
        { student: f.userId, forWinner: false },
      ],
      [
        { student: a.userId, status: 'attended' },
        { student: b.userId, status: 'absent' },
        { student: c.userId, status: 'attended' },
        { student: d.userId, status: 'attended' },
        { student: e.userId, status: 'blocked_by_capacity' },
      ],
    );
    const scoring = t.app.get(ScoringService);
    expect(await scoring.scoreEvent(event.id)).toBe(4);
    expect(await scoring.scoreEvent(event.id)).toBe(0); // idempotent

    expect(await pointsOf(a)).toBe(1520);
    expect(await pointsOf(b)).toBe(1480);
    expect(await pointsOf(c)).toBe(1530);
    expect(await pointsOf(d)).toBe(1510);
    expect(await pointsOf(e)).toBe(1500); // waiting list: no loss
    expect(await pointsOf(f)).toBe(1500); // voted other, absent: 0

    const history = await call(t, a, 'GET', '/me/score-entries');
    expect(history.body['items']).toMatchObject([
      { ruleCode: 'voted_winner_attended', points: 20, event: { id: event.publicId } },
    ]);

    const board = await call(t, a, 'GET', '/leaderboard');
    const entries = board.body['entries'] as { rank: number; points: number }[];
    expect(entries[0]).toMatchObject({ rank: 1, points: 1530 });
    expect(entries.length).toBe(10);
    expect(board.body['me']).toMatchObject({ points: 1520, rank: 2, attendedCount: 1 });
    const etag = board.headers.get('etag');
    expect(etag).not.toBeNull();
    const cached = await a.request(`${t.base}/api/v1/leaderboard`, {
      headers: { 'If-None-Match': etag ?? '' },
    });
    expect(cached.status).toBe(304);

    // A cancelled event never scores.
    const cancelled = await newEvent('pool');
    expect(await scoring.scoreEvent(cancelled.id)).toBe(0);
  });
});

describe('excuses', () => {
  it('reverse an earlier loss once, and only the advisor or an admin may review', async () => {
    const student = await t.loginAs('student', 10);
    const event = await wonEvent(
      [{ student: student.userId, forWinner: true }],
      [{ student: student.userId, status: 'absent' }],
    );
    await t.app.get(ScoringService).scoreEvent(event.id);
    const before = Number(await pointsOf(student));

    const submitted = await call(t, student, 'POST', `/events/${event.publicId}/excuses`, {
      reason: 'Hastaydım.',
    });
    expect(submitted.status).toBe(201);
    expect(
      (await call(t, student, 'POST', `/events/${event.publicId}/excuses`, { reason: 'x' })).status,
    ).toBe(409);

    const outsider = await t.loginAs('advisor', 1);
    const id = String(submitted.body['id']);
    expect(
      (await call(t, outsider, 'PATCH', `/excuses/${id}`, { decision: 'approve' })).status,
    ).toBe(403);
    const approved = await call(t, advisor, 'PATCH', `/excuses/${id}`, { decision: 'approve' });
    expect(approved.body).toMatchObject({ status: 'approved' });
    expect(Number(await pointsOf(student))).toBe(before + 20);
    expect((await call(t, advisor, 'PATCH', `/excuses/${id}`, { decision: 'reject' })).status).toBe(
      409,
    );

    const list = await call(t, advisor, 'GET', `/events/${event.publicId}/excuses?status=approved`);
    expect((list.body['items'] as unknown[]).length).toBe(1);
    const final = await t.db.prisma.attendances.findFirstOrThrow({
      where: { event_id: event.id, student_user_id: student.userId },
    });
    expect(final.status).toBe('excused');
  });
});

describe('score rules', () => {
  it('are versioned and audited, admin only, and bounded', async () => {
    const student = await t.loginAs('student', 11);
    expect(
      (await call(t, student, 'PUT', '/score-rules/no_vote_attended', { points: 15 })).status,
    ).toBe(403);
    expect(
      (await call(t, admin, 'PUT', '/score-rules/no_vote_attended', { points: 5000 })).status,
    ).toBe(422);
    const updated = await call(t, admin, 'PUT', '/score-rules/no_vote_attended', { points: 15 });
    expect(updated.body).toMatchObject({ code: 'no_vote_attended', points: 15 });
    const versions = await t.db.prisma.score_rules.findMany({
      where: { code: 'no_vote_attended' },
    });
    expect(versions.length).toBe(2);
    expect(versions.filter((v) => v.valid_to === null).length).toBe(1);
    const audit = await t.db.prisma.audit_log.findFirst({ where: { action: 'score_rule.update' } });
    expect(audit).not.toBeNull();
    const rules = await call(t, student, 'GET', '/score-rules');
    expect((rules.body['items'] as unknown[]).length).toBe(6);
    await call(t, admin, 'PUT', '/score-rules/no_vote_attended', { points: 10 });
  });
});

describe('seasons', () => {
  it('opens the current academic year automatically', async () => {
    const student = await t.loginAs('student', 12);
    const seasons = await call(t, student, 'GET', '/seasons');
    const items = seasons.body['items'] as { name: string; status: string; startsOn: string }[];
    expect(items[0]?.status).toBe('active');
    expect(items[0]?.startsOn).toMatch(/-09-01$/);
    expect((await call(t, student, 'GET', '/leaderboard?season=1999-2000')).status).toBe(404);
  });
});
