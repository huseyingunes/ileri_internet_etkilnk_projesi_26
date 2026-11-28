import { Injectable } from '@nestjs/common';
import { type ConsentKind, consentKindSchema } from '@etkinlik/shared';
import { isoFromDb, nowForDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';

export interface ConsentView {
  kind: ConsentKind;
  granted: boolean;
  textVersion: string;
  grantedAt?: string;
}

/**
 * Explicit, revocable consent (KVKK) for location, WhatsApp and photos.
 * History is kept: revoking closes the active row, granting again inserts one.
 */
@Injectable()
export class ConsentsService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: bigint): Promise<ConsentView[]> {
    const active = await this.db.consents.findMany({
      where: { user_id: userId, revoked_at: null },
    });
    return consentKindSchema.options.map((kind) => {
      const row = active.find((consent) => consent.kind === kind);
      return row === undefined
        ? { kind, granted: false, textVersion: '' }
        : {
            kind,
            granted: true,
            textVersion: row.text_version,
            grantedAt: isoFromDb(row.granted_at),
          };
    });
  }

  async isGranted(userId: bigint, kind: ConsentKind): Promise<boolean> {
    return (
      (await this.db.consents.count({ where: { user_id: userId, kind, revoked_at: null } })) > 0
    );
  }

  /** Idempotent: an active consent for the same text version is returned unchanged. */
  /** Users among `ids` with an active consent of this kind (one query). */
  async grantedAmong(ids: readonly bigint[], kind: ConsentKind): Promise<Set<bigint>> {
    if (ids.length === 0) return new Set();
    const rows = await this.db.consents.findMany({
      where: { user_id: { in: [...ids] }, kind, revoked_at: null },
      select: { user_id: true },
    });
    return new Set(rows.map((r) => r.user_id));
  }

  async grant(userId: bigint, kind: ConsentKind, textVersion: string): Promise<ConsentView> {
    const row = await this.db.$transaction(async (tx) => {
      const active = await tx.consents.findFirst({
        where: { user_id: userId, kind, revoked_at: null },
      });
      if (active?.text_version === textVersion) {
        return active;
      }
      if (active !== null) {
        await tx.consents.update({ where: { id: active.id }, data: { revoked_at: nowForDb() } });
      }
      return await tx.consents.create({
        data: { user_id: userId, kind, text_version: textVersion },
      });
    });
    return {
      kind,
      granted: true,
      textVersion: row.text_version,
      grantedAt: isoFromDb(row.granted_at),
    };
  }

  async revoke(userId: bigint, kind: ConsentKind): Promise<void> {
    await this.db.consents.updateMany({
      where: { user_id: userId, kind, revoked_at: null },
      data: { revoked_at: nowForDb() },
    });
  }
}
