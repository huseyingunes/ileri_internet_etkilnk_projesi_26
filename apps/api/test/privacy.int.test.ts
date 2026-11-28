import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Notifier } from '../src/modules/notifications/notifier.service.js';
import { DataRequestsService } from '../src/modules/privacy/data-requests.service.js';
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

const processOpen = async () => {
  const service = t.app.get(DataRequestsService);
  const open = await t.db.prisma.data_requests.findMany({ where: { status: 'pending' } });
  for (const r of open) await service.process(r.id);
};

describe('download my data / delete my data', () => {
  it('exports everything about the person, then anonymizes while keeping the ledger', async () => {
    const student = await t.loginAs('student', 0);
    const event = await scenario.wonEvent(
      t,
      admin,
      advisor,
      [{ student: student.userId, forWinner: true }],
      [{ student: student.userId, status: 'attended' }],
    );
    await t.app.get(ScoringService).scoreEvent(event.id);
    await call(t, student, 'POST', `/events/${event.publicId}/ratings`, {
      score: 5,
      comment: 'Harikaydı, Ayşe hocaya teşekkürler.',
    });
    await call(t, student, 'PUT', '/me/consents/whatsapp', { textVersion: '2026-11' });
    await call(t, student, 'PATCH', '/me', { phone: '+905551234567' });
    await t.app.get(Notifier).notify([
      {
        userId: student.userId,
        type: 'vote_result',
        title: 'Sonuç',
        body: 'x',
        dedupeKey: 'p:1',
      },
    ]);

    const first = await call(t, student, 'POST', '/me/data-requests', { kind: 'export' });
    expect(first.status).toBe(202);
    const again = await call(t, student, 'POST', '/me/data-requests', { kind: 'export' });
    expect(again.status).toBe(200);
    expect(again.body['id']).toBe(first.body['id']);
    await processOpen();

    const list = await call(t, student, 'GET', '/me/data-requests');
    const done = (list.body['items'] as { status: string; downloadUrl?: string }[])[0];
    expect(done?.status).toBe('completed');
    const download = await student.request(`${t.base}${done?.downloadUrl ?? ''}`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    const dump = (await download.json()) as Record<string, unknown>;
    expect(Object.keys(dump)).toEqual(
      expect.arrayContaining([
        'profile',
        'votes',
        'attendance',
        'points',
        'feedback',
        'notifications',
      ]),
    );
    expect(JSON.stringify(dump)).toContain('+905551234567');
    expect(JSON.stringify(dump['points'])).toContain('voted_winner_attended');

    const other = await t.loginAs('student', 1);
    expect((await other.request(`${t.base}${done?.downloadUrl ?? ''}`)).status).toBe(404);

    expect((await call(t, student, 'POST', '/me/data-requests', { kind: 'delete' })).status).toBe(
      202,
    );
    await processOpen();

    const user = await t.db.prisma.users.findUniqueOrThrow({ where: { id: student.userId } });
    expect(user).toMatchObject({
      display_name: 'Silinmiş kullanıcı',
      phone: null,
      student_number: null,
      is_active: false,
    });
    expect(user.email).toMatch(/@anonim\.invalid$/);
    expect(user.anonymized_at).not.toBeNull();
    expect((await call(t, student, 'GET', '/me')).status).toBe(401); // sessions revoked

    const rating = await t.db.prisma.ratings.findFirstOrThrow({
      where: { student_user_id: student.userId },
    });
    expect(rating).toMatchObject({ score: 5, comment: null });
    expect(
      await t.db.prisma.score_ledger.count({ where: { student_user_id: student.userId } }),
    ).toBe(1);
    expect(await t.db.prisma.notifications.count({ where: { user_id: student.userId } })).toBe(0);
    expect(
      await t.db.prisma.consents.count({ where: { user_id: student.userId, revoked_at: null } }),
    ).toBe(0);

    // Idempotent: processing the delete again changes nothing and does not fail.
    const deletion = await t.db.prisma.data_requests.findFirstOrThrow({
      where: { user_id: student.userId, kind: 'delete' },
    });
    await t.app.get(DataRequestsService).process(deletion.id);
  });

  it('validates the request kind', async () => {
    const student = await t.loginAs('student', 2);
    expect((await call(t, student, 'POST', '/me/data-requests', { kind: 'all' })).status).toBe(422);
  });
});
