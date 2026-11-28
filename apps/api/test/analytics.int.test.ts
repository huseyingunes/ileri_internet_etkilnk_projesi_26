import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AnalyticsService } from '../src/modules/analytics/analytics.service.js';
import { FeedbackService } from '../src/modules/feedback/feedback.service.js';
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

describe('admin dashboard', () => {
  it('aggregates the season from refreshed views, scoped by role', async () => {
    const [a, b, c] = await Promise.all([0, 1, 2].map((i) => t.loginAs('student', i)));
    if (!a || !b || !c) throw new Error('students');
    const event = await scenario.wonEvent(
      t,
      admin,
      advisor,
      [
        { student: a.userId, forWinner: true },
        { student: b.userId, forWinner: true },
        { student: c.userId, forWinner: false },
      ],
      [
        { student: a.userId, status: 'attended' },
        { student: b.userId, status: 'absent' },
      ],
    );
    await t.db.prisma.events.update({
      where: { id: event.id },
      data: {
        organizer_community_id: (await t.db.prisma.communities.findFirstOrThrow()).id,
        organizer_user_id: null,
      },
    });
    await call(t, a, 'POST', `/events/${event.publicId}/ratings`, { score: 4 });
    const feedback = t.app.get(FeedbackService);
    await feedback.createPrompts(event.id);
    const prompt = (await call(t, b, 'GET', '/me/reason-prompts')).body['items'] as {
      id: string;
    }[];
    await call(t, b, 'PUT', `/reason-prompts/${prompt[0]?.id ?? ''}/answer`, {
      answer: 'Vize sınavım vardı.',
    });

    const analytics = t.app.get(AnalyticsService);
    expect((await analytics.refresh()).classified).toBe(1);
    expect((await analytics.refresh()).classified).toBe(0);

    const overview = await call(t, admin, 'GET', '/analytics/overview');
    expect(overview.status).toBe(200);
    expect(overview.body).toMatchObject({
      completedEvents: 1,
      voterAttendanceRate: 0.5,
      averageRating: 4,
      nonAttendanceReasons: [{ label: 'Ders veya sınav', count: 1 }],
    });
    expect(Number(overview.body['registeredStudents'])).toBeGreaterThanOrEqual(3);
    const science = (
      overview.body['byCategory'] as { category: string; votes: number; attendees: number }[]
    ).find((x) => x.category === 'science');
    expect(science).toEqual({ category: 'science', votes: 3, attendees: 1 });
    expect((overview.body['communities'] as { wins: number }[])[0]).toMatchObject({
      completedEvents: 1,
      wins: 1,
      averageRating: 4,
    });
    const hours = overview.body['attendanceByHour'] as { attendees: number }[];
    expect(hours.reduce((sum, h) => sum + h.attendees, 0)).toBe(1);

    const otherAdvisor = await t.loginAs('advisor', 1);
    const scoped = await call(t, otherAdvisor, 'GET', '/analytics/overview');
    expect(scoped.body).toMatchObject({ completedEvents: 0, voterAttendanceRate: null });

    const sports = await call(t, admin, 'GET', '/analytics/overview?category=sports');
    expect(sports.body).toMatchObject({ completedEvents: 0 });
    expect((sports.body['byCategory'] as unknown[]).length).toBe(1);

    expect((await call(t, a, 'GET', '/analytics/overview')).status).toBe(403);
    expect((await call(t, admin, 'GET', '/analytics/overview?category=x')).status).toBe(422);
  });
});
