import { Injectable } from '@nestjs/common';
import type { Page, PageQuery, UserSummary } from '@etkinlik/shared';
import { isoFromDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { UsersService } from './users.service.js';

export interface AuditEntryView {
  actor?: UserSummary;
  action: string;
  entityType: string;
  entityId?: string;
  details: unknown;
  requestId?: string;
  createdAt: string;
}

/** Read side of the audit log for admins, newest first. */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
  ) {}

  async list(query: PageQuery & { action?: string | undefined }): Promise<Page<AuditEntryView>> {
    const rows = await this.db.audit_log.findMany({
      where: {
        ...(query.action === undefined ? {} : { action: query.action }),
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const actors = await this.users.summaries(
      pageRows.flatMap((row) => (row.actor_user_id === null ? [] : [row.actor_user_id])),
    );
    return {
      items: pageRows.map((row) => {
        const actor = row.actor_user_id === null ? undefined : actors.get(row.actor_user_id);
        return {
          ...(actor === undefined ? {} : { actor }),
          action: row.action,
          entityType: row.entity_type,
          ...(row.entity_id === null ? {} : { entityId: row.entity_id.toString() }),
          details: row.details,
          ...(row.request_id === null ? {} : { requestId: row.request_id }),
          createdAt: isoFromDb(row.created_at),
        };
      }),
      page: { nextCursor: hasMore ? (pageRows.at(-1)?.public_id ?? null) : null },
    };
  }
}
