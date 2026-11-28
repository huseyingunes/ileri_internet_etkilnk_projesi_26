import { Inject, Injectable } from '@nestjs/common';
import {
  type Page,
  type PageQuery,
  type Role,
  roleSchema,
  type UserSummary,
} from '@etkinlik/shared';
import { toPage } from '../../common/pagination.js';
import { isoFromDb, nowForDb } from '../../common/time.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../infra/database.js';
import { AuditService } from './audit.service.js';
import type { IdentityClaims } from './oidc.service.js';
import { initialRole, removesLastAdmin } from './role-policy.js';
import { SessionStore } from './session.store.js';

export interface ActiveUser {
  id: bigint;
  publicId: string;
  role: Role;
}

export interface UserAdminView extends UserSummary {
  email: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface UserRow {
  id: bigint;
  public_id: string;
  display_name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

function toSummary(row: Pick<UserRow, 'public_id' | 'display_name' | 'role'>): UserSummary {
  return { id: row.public_id, displayName: row.display_name, role: roleSchema.parse(row.role) };
}

function toAdminView(row: UserRow): UserAdminView {
  return {
    ...toSummary(row),
    email: row.email,
    isActive: row.is_active,
    ...(row.last_login_at === null ? {} : { lastLoginAt: isoFromDb(row.last_login_at) }),
    createdAt: isoFromDb(row.created_at),
  };
}

/** Identity module's public service: other modules use it instead of the users table. */
@Injectable()
export class UsersService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly sessions: SessionStore,
  ) {}

  /** Creates or refreshes the local user after a successful OIDC login. */
  async provision(claims: IdentityClaims): Promise<ActiveUser> {
    const displayName =
      claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(' ').trim();
    const existing = await this.db.users.findUnique({ where: { oidc_subject: claims.sub } });

    if (existing === null) {
      const role = initialRole({
        email: claims.email,
        claimedRole: claims.etkinlik_role,
        initialAdminEmail: this.env.INITIAL_ADMIN_EMAIL,
      });
      const created = await this.db.users.create({
        data: {
          oidc_subject: claims.sub,
          email: claims.email,
          display_name: displayName === '' ? claims.email : displayName,
          role,
          student_number: role === 'student' ? (claims.student_number ?? null) : null,
          last_login_at: nowForDb(),
        },
      });
      if (role === 'admin' && claims.email === this.env.INITIAL_ADMIN_EMAIL) {
        await this.audit.record({
          actorUserId: null,
          action: 'user.initial_admin_assigned',
          entityType: 'user',
          entityId: created.id,
        });
      }
      return { id: created.id, publicId: created.public_id, role };
    }

    if (!existing.is_active) {
      throw new ForbiddenError('Hesabınız devre dışı bırakılmış.');
    }
    const updated = await this.db.users.update({
      where: { id: existing.id },
      data: {
        email: claims.email,
        ...(displayName === '' ? {} : { display_name: displayName }),
        last_login_at: nowForDb(),
      },
    });
    return { id: updated.id, publicId: updated.public_id, role: roleSchema.parse(updated.role) };
  }

  async findActive(id: bigint): Promise<ActiveUser | undefined> {
    const row = await this.db.users.findUnique({
      where: { id },
      select: { id: true, public_id: true, role: true, is_active: true },
    });
    if (row?.is_active !== true) {
      return undefined;
    }
    return { id: row.id, publicId: row.public_id, role: roleSchema.parse(row.role) };
  }

  async requireByPublicId(publicId: string): Promise<{ id: bigint; role: Role }> {
    const row = await this.db.users.findUnique({
      where: { public_id: publicId },
      select: { id: true, role: true, is_active: true },
    });
    if (row?.is_active !== true) {
      throw new NotFoundError('Kullanıcı bulunamadı.');
    }
    return { id: row.id, role: roleSchema.parse(row.role) };
  }

  /** Summaries for ids owned by other modules, in one query (no N+1). */
  async summaries(ids: readonly bigint[]): Promise<Map<bigint, UserSummary>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.users.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, public_id: true, display_name: true, role: true },
    });
    return new Map(rows.map((row) => [row.id, toSummary(row)]));
  }

  /** Contact details for notification delivery (active, not anonymized users only). */
  async contactsOf(
    ids: readonly bigint[],
  ): Promise<Map<bigint, { email: string; phone: string | null; displayName: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.users.findMany({
      where: { id: { in: [...new Set(ids)] }, is_active: true, anonymized_at: null },
      select: { id: true, email: true, phone: true, display_name: true },
    });
    return new Map(
      rows.map((r) => [r.id, { email: r.email, phone: r.phone, displayName: r.display_name }]),
    );
  }

  /** Ids of active students (leaderboard candidates). */
  async activeStudentIds(): Promise<bigint[]> {
    const rows = await this.db.users.findMany({
      where: { role: 'student', is_active: true, anonymized_at: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async listAdvisors(): Promise<{ items: UserSummary[] }> {
    const rows = await this.db.users.findMany({
      where: { role: 'advisor', is_active: true, anonymized_at: null },
      orderBy: { display_name: 'asc' },
      take: 200,
      select: { public_id: true, display_name: true, role: true },
    });
    return { items: rows.map(toSummary) };
  }

  async getProfile(id: bigint) {
    const row = await this.db.users.findUniqueOrThrow({ where: { id } });
    return {
      id: row.public_id,
      displayName: row.display_name,
      email: row.email,
      role: roleSchema.parse(row.role),
      ...(row.student_number === null ? {} : { studentNumber: row.student_number }),
      ...(row.phone === null ? {} : { phone: row.phone }),
    };
  }

  async setPhone(id: bigint, phone: string | null): Promise<void> {
    await this.db.users.update({ where: { id }, data: { phone } });
  }

  async list(
    query: PageQuery & { role?: Role | undefined; q?: string | undefined },
  ): Promise<Page<UserAdminView>> {
    const rows = await this.db.users.findMany({
      where: {
        anonymized_at: null,
        ...(query.role === undefined ? {} : { role: query.role }),
        ...(query.q === undefined
          ? {}
          : {
              OR: [
                { display_name: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q.toLowerCase() } },
              ],
            }),
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, toAdminView);
  }

  /** Role assignment and (de)activation by an admin; audited, never removes the last admin. */
  async adminUpdate(
    actor: { id: bigint; requestId: string },
    publicId: string,
    change: { role?: Role | undefined; isActive?: boolean | undefined },
  ): Promise<UserAdminView> {
    const updated = await this.db.$transaction(async (tx) => {
      // Serialize admin changes so two concurrent demotions cannot remove the last admin.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('users:admin-changes', 0))`;
      const user = await tx.users.findUnique({ where: { public_id: publicId } });
      if (user?.anonymized_at !== null) {
        throw new NotFoundError('Kullanıcı bulunamadı.');
      }
      const currentRole = roleSchema.parse(user.role);
      const nextRole = change.role ?? currentRole;
      const nextActive = change.isActive ?? user.is_active;
      const activeAdminCount = await tx.users.count({ where: { role: 'admin', is_active: true } });
      if (
        removesLastAdmin({
          currentRole,
          nextRole,
          currentlyActive: user.is_active,
          nextActive,
          activeAdminCount,
        })
      ) {
        throw new ConflictError('Sistemde en az bir etkin yönetici kalmalıdır.');
      }
      const row = await tx.users.update({
        where: { id: user.id },
        data: {
          role: nextRole,
          is_active: nextActive,
          ...(nextRole === 'student' ? {} : { student_number: null }),
        },
      });
      await tx.audit_log.create({
        data: {
          actor_user_id: actor.id,
          action: 'user.updated',
          entity_type: 'user',
          entity_id: user.id,
          details: {
            fromRole: currentRole,
            toRole: nextRole,
            fromActive: user.is_active,
            toActive: nextActive,
          },
          request_id: actor.requestId,
        },
      });
      return row;
    });
    if (!updated.is_active || change.role !== undefined) {
      await this.sessions.destroyAllForUser(updated.id);
    }
    return toAdminView(updated);
  }
}
