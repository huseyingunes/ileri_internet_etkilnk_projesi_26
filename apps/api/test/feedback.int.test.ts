import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('reason questions', () => {
  it('ask only the winner voters, once, and accept one answer from the right student', async () => {
    const [a, b, c, e] = await Promise.all([0, 1, 2, 3].map((i) => t.loginAs('student', i)));
    if (!a || !b || !c || !e) throw new Error('students');
    const event = await scenario.wonEvent(
      t,
      admin,
      advisor,
      [
        { student: a.userId, forWinner: true },
        { student: b.userId, forWinner: true },
        { student: c.userId, forWinner: false },
        { student: e.userId, forWinner: true },
      ],
      [
        { student: a.userId, status: 'attended' },
        { student: e.userId, status: 'blocked_by_capacity' },
      ],
    );
    const feedback = t.app.get(FeedbackService);
    expect(await feedback.createPrompts(event.id)).toBe(2);
    expect(await feedback.createPrompts(event.id)).toBe(0);

    const mine = await call(t, a, 'GET', '/me/reason-prompts');
    expect(mine.body['items']).toMatchObject([
      { kind: 'why_attended', question: 'Bu etkinliğe neden katıldınız?' },
    ]);
    const bs = await call(t, b, 'GET', '/me/reason-prompts');
    expect(bs.body['items']).toMatchObject([{ kind: 'why_not_attended' }]);
    expect((await call(t, c, 'GET', '/me/reason-prompts')).body['items']).toEqual([]);
    expect((await call(t, e, 'GET', '/me/reason-prompts')).body['items']).toEqual([]);

    const id = String((mine.body['items'] as { id: string }[])[0]?.id);
    expect((await call(t, b, 'PUT', `/reason-prompts/${id}/answer`, { answer: 'x' })).status).toBe(
      404,
    );
    expect(
      (await call(t, a, 'PUT', `/reason-prompts/${id}/answer`, { answer: 'Konu ilgimi çekti.' }))
        .status,
    ).toBe(204);
    expect((await call(t, a, 'PUT', `/reason-prompts/${id}/answer`, { answer: 'y' })).status).toBe(
      409,
    );
    expect((await call(t, a, 'GET', '/me/reason-prompts')).body['items']).toEqual([]);
    const answered = await call(t, a, 'GET', '/me/reason-prompts?answered=true');
    expect((answered.body['items'] as { answeredAt?: string }[])[0]?.answeredAt).toBeDefined();
  });
});

describe('ratings and the archive page', () => {
  it('lets verified attendees rate once and shows the archive with gallery', async () => {
    const [a, b] = await Promise.all([4, 5].map((i) => t.loginAs('student', i)));
    if (!a || !b) throw new Error('students');
    const event = await scenario.wonEvent(
      t,
      admin,
      advisor,
      [
        { student: a.userId, forWinner: true },
        { student: b.userId, forWinner: true },
      ],
      [
        { student: a.userId, status: 'attended' },
        { student: b.userId, status: 'absent' },
      ],
    );
    const path = `/events/${event.publicId}`;
    const rated = await call(t, a, 'POST', `${path}/ratings`, { score: 4, comment: 'Güzeldi.' });
    expect(rated.status).toBe(201);
    expect(rated.body).toMatchObject({ score: 4, comment: 'Güzeldi.' });
    expect((await call(t, a, 'POST', `${path}/ratings`, { score: 5 })).status).toBe(409);
    expect((await call(t, b, 'POST', `${path}/ratings`, { score: 5 })).status).toBe(403);
    expect((await call(t, a, 'POST', `${path}/ratings`, { score: 6 })).status).toBe(422);

    const report = await call(t, advisor, 'GET', `${path}/ratings`);
    expect(report.body).toMatchObject({ averageRating: 4, ratingCount: 1 });
    // Anonymous: only score, comment and time per rating.
    for (const item of report.body['items'] as Record<string, unknown>[]) {
      expect(Object.keys(item).sort()).toEqual(['comment', 'createdAt', 'score']);
    }
    expect((await call(t, a, 'GET', `${path}/ratings`)).status).toBe(403);
    const outsider = await t.loginAs('advisor', 1);
    expect((await call(t, outsider, 'GET', `${path}/ratings`)).status).toBe(403);

    // Gallery: the advisor attaches an uploaded (ready) image.
    const media = await t.db.prisma.media_objects.create({
      data: {
        storage_key: `originals/test-${Math.random().toString(36).slice(2)}`,
        content_type: 'image/jpeg',
        byte_size: 1000,
        width: 1200,
        height: 800,
        status: 'ready',
        alt: 'Etkinlikten bir kare',
        variants: [{ key: 'variants/x/640.webp', format: 'webp', width: 640, height: 427 }],
        uploaded_by_user_id: advisor.userId,
      },
    });
    expect((await call(t, a, 'POST', `${path}/photos`, { mediaId: media.public_id })).status).toBe(
      403,
    );
    expect(
      (await call(t, advisor, 'POST', `${path}/photos`, { mediaId: media.public_id })).status,
    ).toBe(204);
    const photos = await call(t, b, 'GET', `${path}/photos`);
    expect(photos.body['items']).toMatchObject([
      { id: media.public_id, alt: 'Etkinlikten bir kare' },
    ]);

    const summary = await call(t, b, 'GET', `${path}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      participantCount: 1,
      averageRating: 4,
      ratingCount: 1,
      viewer: { canRate: false, rated: false },
    });
    expect((summary.body['voting'] as { status: string }[])[0]?.status).toBe('winner');
    expect((summary.body['photos'] as unknown[]).length).toBe(1);
    const fromA = await call(t, a, 'GET', `${path}/summary`);
    expect(fromA.body['viewer']).toEqual({ canRate: false, rated: true });
    const etag = summary.headers.get('etag') ?? '';
    expect(
      (await b.request(`${t.base}/api/v1${path}/summary`, { headers: { 'If-None-Match': etag } }))
        .status,
    ).toBe(304);

    expect((await call(t, advisor, 'DELETE', `${path}/photos/${media.public_id}`)).status).toBe(
      204,
    );
    expect((await call(t, advisor, 'DELETE', `${path}/photos/${media.public_id}`)).status).toBe(
      404,
    );

    const upcoming = await scenario.newEvent(t, admin, advisor, 'scheduled');
    expect((await call(t, b, 'GET', `/events/${upcoming.publicId}/summary`)).status).toBe(409);
  });
});
