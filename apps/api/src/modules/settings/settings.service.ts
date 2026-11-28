import { Injectable } from '@nestjs/common';
import { DEFAULT_SETTINGS, type Settings, settingsSchema } from '@etkinlik/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { DatabaseService } from '../../infra/database.js';
import { AuditService } from '../identity/audit.service.js';

const KEYS: readonly (keyof Settings)[] = [
  'minimumVotesToWin',
  'defaultAttendanceRadiusM',
  'defaultQrRefreshSeconds',
  'showLiveVoteCounts',
];
/** app_settings keys are snake_case (CHECK constraint); API fields are camelCase. */
const DB_KEY: Record<keyof Settings, string> = {
  minimumVotesToWin: 'minimum_votes_to_win',
  defaultAttendanceRadiusM: 'default_attendance_radius_m',
  defaultQrRefreshSeconds: 'default_qr_refresh_seconds',
  showLiveVoteCounts: 'show_live_vote_counts',
};

/** Admin-editable settings stored as validated JSON in app_settings; every change is audited. */
@Injectable()
export class SettingsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<Settings> {
    const rows = await this.db.app_settings.findMany();
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    return settingsSchema.parse(
      Object.fromEntries(
        KEYS.map((key) => [key, stored.get(DB_KEY[key]) ?? DEFAULT_SETTINGS[key]]),
      ),
    );
  }

  async update(
    change: { [K in keyof Settings]?: Settings[K] | undefined },
    actor: { id: bigint; requestId: string },
  ): Promise<Settings> {
    const next = settingsSchema.parse({ ...(await this.get()), ...change });
    await this.db.$transaction(async (tx) => {
      for (const key of KEYS) {
        if (change[key] === undefined) continue;
        const value: Prisma.InputJsonValue = next[key];
        await tx.app_settings.upsert({
          where: { key: DB_KEY[key] },
          create: { key: DB_KEY[key], value, updated_by_user_id: actor.id },
          update: { value, updated_by_user_id: actor.id },
        });
      }
      await tx.audit_log.create({
        data: {
          actor_user_id: actor.id,
          action: 'settings.updated',
          entity_type: 'settings',
          details: Object.fromEntries(Object.entries(change).map(([k, v]) => [k, String(v)])),
          request_id: actor.requestId,
        },
      });
    });
    return next;
  }
}
