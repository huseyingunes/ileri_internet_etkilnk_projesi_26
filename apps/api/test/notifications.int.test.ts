import { createHmac } from 'node:crypto';
import { istanbulDateOf, nowInstant } from '@etkinlik/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryEmailSender, MemoryWhatsAppSender } from '../src/infra/messaging.js';
import {
  InterestsJob,
  InvitationsJob,
  RemindersJob,
} from '../src/modules/notifications/notification.jobs.js';
import { Notifier } from '../src/modules/notifications/notifier.service.js';
import { call, startTestApp, type TestApp } from './support/app.js';
import type { TestBrowser } from './support/browser.js';
import * as scenario from './support/scenario.js';

const APP_SECRET = 'whatsapp-app-secret-0123456789';
const VERIFY_TOKEN = 'whatsapp-verify-token-0123456789';

let t: TestApp;
let admin: TestBrowser & { userId: bigint };
let advisor: TestBrowser & { userId: bigint };

beforeAll(async () => {
  t = await startTestApp({
    worker: true,
    env: {
      WHATSAPP_DRIVER: 'memory',
      WHATSAPP_PHONE_NUMBER_ID: '1234567890',
      WHATSAPP_ACCESS_TOKEN: 'whatsapp-access-token-0123456789',
      WHATSAPP_APP_SECRET: APP_SECRET,
      WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
    },
  });
  admin = await t.loginAs('admin');
  advisor = await t.loginAs('advisor');
}, 300_000);

afterAll(async () => {
  await t.stop();
});

/** Waits until the worker has processed the user's outbound deliveries. */
async function settled(userId: bigint) {
  for (let i = 0; i < 50; i += 1) {
    const open = await t.db.prisma.notification_deliveries.count({
      where: { notifications: { user_id: userId }, status: 'queued' },
    });
    if (open === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('deliveries still queued');
}

const worker = () => {
  if (t.worker === undefined) throw new Error('worker not started');
  return t.worker;
};

describe('in-app notifications and e-mail', () => {
  it('notify on a confirmed application, e-mail a copy and mark as read', async () => {
    const student = await t.loginAs('student', 0);
    const event = await scenario.newEvent(t, admin, advisor, 'scheduled');
    await t.db.prisma.events.update({
      where: { id: event.id },
      data: {
        starts_at: new Date(Date.now() + 48 * 3_600_000),
        ends_at: new Date(Date.now() + 50 * 3_600_000),
      },
    });
    expect((await call(t, student, 'POST', `/events/${event.publicId}/applications`)).status).toBe(
      201,
    );

    const list = await call(t, student, 'GET', '/me/notifications');
    expect(list.body['unreadCount']).toBe(1);
    const [first] = list.body['items'] as { id: string; type: string; link: string }[];
    expect(first).toMatchObject({
      type: 'application_confirmed',
      link: `/etkinlikler/${event.publicId}`,
    });

    await settled(student.userId);
    const mail = MemoryEmailSender.shared.outbox.find((m) => m.subject === 'Başvurunuz onaylandı');
    expect(mail?.text).toContain(`https://etkinlik.test/etkinlikler/${event.publicId}`);

    const other = await t.loginAs('student', 1);
    expect(
      (await call(t, other, 'PATCH', `/me/notifications/${first?.id ?? ''}`, { read: true }))
        .status,
    ).toBe(404);
    expect(
      (await call(t, student, 'PATCH', `/me/notifications/${first?.id ?? ''}`, { read: true }))
        .status,
    ).toBe(204);
    expect(
      (await call(t, student, 'GET', '/me/notifications?unread=true')).body['unreadCount'],
    ).toBe(0);
  });

  it('respects preferences and only uses WhatsApp with consent and a phone number', async () => {
    const student = await t.loginAs('student', 2);
    const prefs = await call(t, student, 'GET', '/me/notification-preferences');
    expect((prefs.body['items'] as unknown[]).length).toBe(16);
    const updated = await call(t, student, 'PUT', '/me/notification-preferences', {
      items: [
        { channel: 'email', type: 'event_reminder', enabled: false },
        { channel: 'whatsapp', type: 'event_reminder', enabled: true },
      ],
    });
    expect(updated.status).toBe(200);
    expect(
      (
        await call(t, student, 'PUT', '/me/notification-preferences', {
          items: [
            { channel: 'email', type: 'event_reminder', enabled: false },
            { channel: 'email', type: 'event_reminder', enabled: true },
          ],
        })
      ).status,
    ).toBe(422);

    const notifier = t.app.get(Notifier);
    const remind = (key: string) =>
      notifier.notify([
        {
          userId: student.userId,
          type: 'event_reminder',
          title: 'Hatırlatma',
          body: 'Yarın.',
          dedupeKey: key,
        },
      ]);
    expect(await remind('test:1')).toBe(1);
    expect(await remind('test:1')).toBe(0); // de-duplicated
    let channels = await t.db.prisma.notification_deliveries.findMany({
      where: { notifications: { user_id: student.userId, dedupe_key: 'test:1' } },
    });
    expect(channels.map((c) => c.channel)).toEqual(['in_app']); // no consent, no phone, e-mail off

    await t.db.prisma.users.update({
      where: { id: student.userId },
      data: { phone: '+905551112233' },
    });
    await call(t, student, 'PUT', '/me/consents/whatsapp', { textVersion: '2026-11' });
    expect(await remind('test:2')).toBe(1);
    await settled(student.userId);
    channels = await t.db.prisma.notification_deliveries.findMany({
      where: { notifications: { user_id: student.userId, dedupe_key: 'test:2' } },
    });
    const whatsapp = channels.find((c) => c.channel === 'whatsapp');
    expect(whatsapp?.status).toBe('sent');
    expect(MemoryWhatsAppSender.shared.outbox.at(-1)).toMatchObject({
      to: '+905551112233',
      template: 'etkinlik_event_reminder',
      language: 'tr',
    });

    // Delivery receipts from Meta update the delivery.
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            { value: { statuses: [{ id: whatsapp?.provider_message_id, status: 'delivered' }] } },
          ],
        },
      ],
    });
    const post = (signature: string) =>
      fetch(`${t.base}/api/v1/webhooks/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
        body,
      });
    const sig = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`;
    expect((await post('sha256=' + '0'.repeat(64))).status).toBe(403);
    expect((await post(sig)).status).toBe(200);
    expect((await post(sig)).status).toBe(200); // redelivery is de-duplicated
    expect(await t.db.prisma.webhook_events.count()).toBe(1);
    await notifier.processWebhooks();
    const after = await t.db.prisma.notification_deliveries.findUniqueOrThrow({
      where: { id: whatsapp?.id ?? 0n },
    });
    expect(after.status).toBe('delivered');
  });

  it('answers the webhook handshake only with the right token', async () => {
    const url = (token: string) =>
      `${t.base}/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`;
    const ok = await fetch(url(VERIFY_TOKEN));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('12345');
    expect((await fetch(url('wrong-token-0123456789abcdef'))).status).toBe(403);
  });
});

describe('interests, invitations and reminders', () => {
  it('invites matching students once and reminds confirmed applicants once', async () => {
    const student = await t.loginAs('student', 3);
    const set = await call(t, student, 'PUT', '/me/interests', {
      selected: ['Robotik', 'satranç'],
    });
    expect([...(set.body['selected'] as string[])].sort()).toEqual(['robotik', 'satranç']);
    expect((await call(t, student, 'PUT', '/me/interests', { selected: ['<b>'] })).status).toBe(
      422,
    );

    const istanbulToday = istanbulDateOf(nowInstant());
    const ballotDate = new Date(`${istanbulToday.toString()}T00:00:00Z`);
    const pool = await scenario.newEvent(t, admin, advisor, 'pool');
    const tag = await t.db.prisma.tags.upsert({
      where: { name: 'robotik' },
      create: { name: 'robotik' },
      update: {},
    });
    await t.db.prisma.event_tags.create({ data: { event_id: pool.id, tag_id: tag.id } });
    await t.db.prisma.daily_ballots.create({
      data: {
        voting_date: ballotDate,
        category: 'science',
        event_id: pool.id,
        selected_by_user_id: admin.userId,
      },
    });
    const invitations = worker().get(InvitationsJob);
    expect(await invitations.run()).toBeGreaterThanOrEqual(1);
    expect(await invitations.run()).toBe(0);
    const inbox = await call(t, student, 'GET', '/me/notifications');
    expect(
      (inbox.body['items'] as { type: string }[]).some((n) => n.type === 'vote_invitation'),
    ).toBe(true);

    const soon = await scenario.newEvent(t, admin, advisor, 'scheduled');
    await t.db.prisma.events.update({
      where: { id: soon.id },
      data: {
        starts_at: new Date(Date.now() + 3 * 3_600_000),
        ends_at: new Date(Date.now() + 5 * 3_600_000),
      },
    });
    await t.db.prisma.applications.create({
      data: {
        event_id: soon.id,
        student_user_id: student.userId,
        status: 'confirmed',
        confirmed_at: new Date(),
      },
    });
    const reminders = worker().get(RemindersJob);
    expect(await reminders.run()).toBeGreaterThanOrEqual(1);
    expect(await reminders.run()).toBe(0);
  });

  it('infers interests from attendance without touching selected ones', async () => {
    const student = await t.loginAs('student', 4);
    await call(t, student, 'PUT', '/me/interests', { selected: ['tiyatro'] });
    const event = await scenario.wonEvent(
      t,
      admin,
      advisor,
      [],
      [{ student: student.userId, status: 'attended' }],
    );
    const tag = await t.db.prisma.tags.upsert({
      where: { name: 'astronomi' },
      create: { name: 'astronomi' },
      update: {},
    });
    await t.db.prisma.event_tags.create({ data: { event_id: event.id, tag_id: tag.id } });
    const job = worker().get(InterestsJob);
    await job.run();
    await job.run(); // idempotent rewrite
    const interests = await call(t, student, 'GET', '/me/interests');
    expect(interests.body).toEqual({ selected: ['tiyatro'], inferred: ['astronomi'] });
    const row = await t.db.prisma.user_interests.findFirstOrThrow({
      where: { user_id: student.userId, tag_id: tag.id },
    });
    expect(row.weight).toBe(1);
  });
});
