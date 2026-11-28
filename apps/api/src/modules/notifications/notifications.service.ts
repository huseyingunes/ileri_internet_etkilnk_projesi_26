import { Injectable } from '@nestjs/common';
import {
  defaultPreference,
  NOTIFICATION_TYPES,
  type NotificationType,
  notificationTypeSchema,
  OUTBOUND_CHANNELS,
  type OutboundChannel,
  type PageQuery,
} from '@etkinlik/shared';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { NotFoundError } from '../../common/errors.js';
import { toPage } from '../../common/pagination.js';
import { isoFromDb, nowForDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';

const linkSchema = z.object({ link: z.string().startsWith('/').optional() });

export interface PreferenceView {
  channel: OutboundChannel;
  type: NotificationType;
  enabled: boolean;
}

/** The signed-in user's notifications and preferences. */
@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(caller: AuthContext, unread: boolean | undefined, query: PageQuery) {
    const where = {
      user_id: caller.userId,
      ...(unread === true ? { read_at: null } : {}),
    };
    const [rows, unreadCount] = await Promise.all([
      this.db.notifications.findMany({
        where: {
          ...where,
          ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
        },
        orderBy: { public_id: 'desc' },
        take: query.limit + 1,
      }),
      this.db.notifications.count({ where: { user_id: caller.userId, read_at: null } }),
    ]);
    const page = toPage(rows, query.limit, (row) => {
      const link = linkSchema.catch({}).parse(row.data).link;
      return {
        id: row.public_id,
        type: notificationTypeSchema.parse(row.type),
        title: row.title,
        body: row.body,
        ...(link === undefined ? {} : { link }),
        ...(row.read_at === null ? {} : { readAt: isoFromDb(row.read_at) }),
        createdAt: isoFromDb(row.created_at),
      };
    });
    return { ...page, unreadCount };
  }

  async markRead(caller: AuthContext, publicId: string): Promise<void> {
    const updated = await this.db.notifications.updateMany({
      where: { public_id: publicId, user_id: caller.userId },
      data: { read_at: nowForDb() },
    });
    if (updated.count === 0) throw new NotFoundError('Bildirim bulunamadı.');
  }

  /** Full matrix (2 channels × 8 types), defaults filled in. */
  async preferences(caller: AuthContext): Promise<{ items: PreferenceView[] }> {
    const rows = await this.db.notification_preferences.findMany({
      where: { user_id: caller.userId },
    });
    return {
      items: OUTBOUND_CHANNELS.flatMap((channel) =>
        NOTIFICATION_TYPES.map((type) => ({
          channel,
          type,
          enabled:
            rows.find((r) => r.channel === channel && r.type === type)?.enabled ??
            defaultPreference(channel),
        })),
      ),
    };
  }

  async replacePreferences(
    caller: AuthContext,
    items: readonly PreferenceView[],
  ): Promise<{ items: PreferenceView[] }> {
    await this.db.$transaction(
      items.map((item) =>
        this.db.notification_preferences.upsert({
          where: {
            user_id_channel_type: {
              user_id: caller.userId,
              channel: item.channel,
              type: item.type,
            },
          },
          create: {
            user_id: caller.userId,
            channel: item.channel,
            type: item.type,
            enabled: item.enabled,
          },
          update: { enabled: item.enabled },
        }),
      ),
    );
    return await this.preferences(caller);
  }
}
