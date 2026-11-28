import { Inject, Injectable } from '@nestjs/common';
import { defaultPreference, type NotificationType, type OutboundChannel } from '@etkinlik/shared';
import { z } from 'zod';
import { nowForDb } from '../../common/time.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../infra/database.js';
import {
  type EmailSender,
  InjectEmail,
  InjectWhatsApp,
  type WhatsAppSender,
} from '../../infra/messaging.js';
import { JobQueue } from '../../infra/queue.js';
import { ConsentsService } from '../identity/consents.service.js';
import { UsersService } from '../identity/users.service.js';

export const NOTIFICATION_DELIVER_JOB = 'notification.deliver';
export const WHATSAPP_WEBHOOK_JOB = 'whatsapp.webhook';

export interface NotificationInput {
  userId: bigint;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app relative link, e.g. `/etkinlikler/<id>`. */
  link?: string;
  /** Identifies "the same news" so a retried job never notifies twice. */
  dedupeKey: string;
}

const linkSchema = z.object({ link: z.string().startsWith('/').optional() });

/** Meta status webhook: entry[].changes[].value.statuses[]. */
const webhookSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                statuses: z
                  .array(
                    z.object({
                      id: z.string().min(1).max(255),
                      status: z.string().min(1).max(40),
                    }),
                  )
                  .default([]),
              }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

const truncate = (text: string, max: number) => (text.length > max ? text.slice(0, max) : text);

/**
 * Channel-independent notifications (prompt section 7): every notification is
 * shown in the app; e-mail and WhatsApp copies are sent by the worker
 * according to the user's preferences. WhatsApp is used only with explicit
 * consent, a phone number and an approved template.
 */
@Injectable()
export class Notifier {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DatabaseService,
    private readonly queue: JobQueue,
    private readonly users: UsersService,
    private readonly consents: ConsentsService,
    @InjectEmail() private readonly email: EmailSender,
    @InjectWhatsApp() private readonly whatsapp: WhatsAppSender,
  ) {}

  /** Creates notifications (idempotent per user and dedupe key) and queues outbound copies. */
  async notify(inputs: readonly NotificationInput[]): Promise<number> {
    if (inputs.length === 0) return 0;
    const created = await this.db.notifications.createManyAndReturn({
      data: inputs.map((n) => ({
        user_id: n.userId,
        type: n.type,
        title: truncate(n.title, 200),
        body: truncate(n.body, 2000),
        data: n.link === undefined ? {} : { link: n.link },
        dedupe_key: n.dedupeKey,
      })),
      skipDuplicates: true,
    });
    if (created.length === 0) return 0;

    const userIds = [...new Set(created.map((n) => n.user_id))];
    const [preferences, contacts, whatsappConsent] = await Promise.all([
      this.db.notification_preferences.findMany({ where: { user_id: { in: userIds } } }),
      this.users.contactsOf(userIds),
      this.consents.grantedAmong(userIds, 'whatsapp'),
    ]);
    const wants = (userId: bigint, channel: OutboundChannel, type: string) =>
      preferences.find((p) => p.user_id === userId && p.channel === channel && p.type === type)
        ?.enabled ?? defaultPreference(channel);

    const deliveries: { notification_id: bigint; channel: string; status: string }[] = [];
    for (const n of created) {
      deliveries.push({ notification_id: n.id, channel: 'in_app', status: 'delivered' });
      const contact = contacts.get(n.user_id);
      if (contact === undefined) continue;
      if (wants(n.user_id, 'email', n.type)) {
        deliveries.push({ notification_id: n.id, channel: 'email', status: 'queued' });
      }
      if (
        this.whatsapp.enabled &&
        contact.phone !== null &&
        whatsappConsent.has(n.user_id) &&
        wants(n.user_id, 'whatsapp', n.type)
      ) {
        deliveries.push({ notification_id: n.id, channel: 'whatsapp', status: 'queued' });
      }
    }
    const rows = await this.db.notification_deliveries.createManyAndReturn({
      data: deliveries,
      skipDuplicates: true,
    });
    for (const row of rows) {
      if (row.status !== 'queued') continue;
      await this.queue.enqueue(
        NOTIFICATION_DELIVER_JOB,
        { deliveryId: row.id.toString() },
        { jobId: `delivery-${row.id.toString()}` },
      );
    }
    return created.length;
  }

  /** Worker: sends one queued e-mail or WhatsApp copy. Throws to let the queue retry. */
  async deliver(deliveryId: bigint): Promise<'sent' | 'skipped' | 'already'> {
    const delivery = await this.db.notification_deliveries.findUnique({
      where: { id: deliveryId },
      include: { notifications: true },
    });
    if (delivery === null || (delivery.status !== 'queued' && delivery.status !== 'failed')) {
      return 'already';
    }
    const n = delivery.notifications;
    const contact = (await this.users.contactsOf([n.user_id])).get(n.user_id);
    const skip = async () => {
      await this.db.notification_deliveries.update({
        where: { id: delivery.id },
        data: { status: 'skipped' },
      });
      return 'skipped' as const;
    };
    if (contact === undefined) return await skip();
    try {
      let messageId: string;
      if (delivery.channel === 'email') {
        const link = linkSchema.catch({}).parse(n.data).link;
        const text = [
          n.body,
          link === undefined ? '' : `\n${this.env.APP_ORIGIN}${link}`,
          '\n\nBildirim tercihlerinizi profil sayfanızdan değiştirebilirsiniz.',
        ].join('');
        ({ messageId } = await this.email.send({ to: contact.email, subject: n.title, text }));
      } else if (delivery.channel === 'whatsapp') {
        // Consent may have been revoked since the notification was queued.
        const consented = await this.consents.isGranted(n.user_id, 'whatsapp');
        if (!consented || contact.phone === null || !this.whatsapp.enabled) return await skip();
        ({ messageId } = await this.whatsapp.sendTemplate({
          to: contact.phone,
          template: `etkinlik_${n.type}`,
          language: 'tr',
          parameters: [n.body],
        }));
      } else {
        return 'already';
      }
      await this.db.notification_deliveries.update({
        where: { id: delivery.id },
        data: {
          status: 'sent',
          provider_message_id: messageId,
          attempt_count: { increment: 1 },
          last_error: null,
        },
      });
      return 'sent';
    } catch (error) {
      await this.db.notification_deliveries.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          attempt_count: { increment: 1 },
          // Error class and message only; no recipient data.
          last_error: truncate(error instanceof Error ? error.message : 'unknown error', 1000),
        },
      });
      throw error;
    }
  }

  /** API: store a verified webhook payload (de-duplicated) and queue its processing. */
  async receiveWebhook(payload: unknown): Promise<number> {
    const parsed = webhookSchema.safeParse(payload);
    if (!parsed.success) return 0;
    const statuses = parsed.data.entry.flatMap((e) => e.changes.flatMap((c) => c.value.statuses));
    if (statuses.length === 0) return 0;
    const stored = await this.db.webhook_events.createManyAndReturn({
      data: statuses.map((s) => ({
        provider: 'whatsapp',
        provider_event_id: `${s.id}:${s.status}`,
        payload: { id: s.id, status: s.status },
      })),
      skipDuplicates: true,
    });
    if (stored.length > 0) {
      await this.queue.enqueue(WHATSAPP_WEBHOOK_JOB, {}, {});
    }
    return stored.length;
  }

  /** Worker: applies stored status events to deliveries. Idempotent. */
  async processWebhooks(): Promise<number> {
    const events = await this.db.webhook_events.findMany({
      where: { provider: 'whatsapp', processed_at: null },
      orderBy: { received_at: 'asc' },
      take: 500,
    });
    const statusSchema = z.object({ id: z.string(), status: z.string() });
    for (const event of events) {
      const status = statusSchema.safeParse(event.payload);
      if (status.success) {
        const mapped =
          status.data.status === 'delivered' || status.data.status === 'read'
            ? 'delivered'
            : status.data.status === 'failed'
              ? 'failed'
              : undefined;
        if (mapped !== undefined) {
          await this.db.notification_deliveries.updateMany({
            where: { channel: 'whatsapp', provider_message_id: status.data.id },
            data: { status: mapped },
          });
        }
      }
      await this.db.webhook_events.update({
        where: {
          provider_provider_event_id: {
            provider: event.provider,
            provider_event_id: event.provider_event_id,
          },
        },
        data: { processed_at: nowForDb() },
      });
    }
    return events.length;
  }
}
