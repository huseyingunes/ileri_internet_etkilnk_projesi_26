import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infra/database.js';

export interface AuditEvent {
  actorUserId: bigint | null;
  action: string;
  entityType: string;
  entityId?: bigint;
  details?: Record<string, string | number | boolean | null>;
  requestId?: string;
}

/** Append-only audit trail for administrative actions (table is protected by a trigger). */
@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async record(event: AuditEvent): Promise<void> {
    await this.db.audit_log.create({
      data: {
        actor_user_id: event.actorUserId,
        action: event.action,
        entity_type: event.entityType,
        entity_id: event.entityId ?? null,
        details: event.details ?? {},
        request_id: event.requestId ?? null,
      },
    });
  }
}
