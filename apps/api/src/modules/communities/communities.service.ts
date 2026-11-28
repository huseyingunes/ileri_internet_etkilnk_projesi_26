import { Injectable } from '@nestjs/common';
import type { CommunitySummary, Page, PageQuery, UserSummary } from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors.js';
import { toPage } from '../../common/pagination.js';
import { nowForDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { AuditService } from '../identity/audit.service.js';
import { UsersService } from '../identity/users.service.js';

export interface CommunityView {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  advisors: UserSummary[];
  archived: boolean;
}

interface CommunityRow {
  id: bigint;
  public_id: string;
  name: string;
  description: string;
  archived_at: Date | null;
  community_advisors: { advisor_user_id: bigint }[];
  _count: { community_members: number };
}

const communityInclude = {
  community_advisors: { select: { advisor_user_id: true } },
  _count: { select: { community_members: true } },
} as const;

/**
 * Student communities. Owns communities, community_members and
 * community_advisors; user details come from the identity module's service.
 */
@Injectable()
export class CommunitiesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  private async toViews(rows: CommunityRow[]): Promise<CommunityView[]> {
    const advisorIds = rows.flatMap((row) => row.community_advisors.map((a) => a.advisor_user_id));
    const summaries = await this.users.summaries(advisorIds);
    return rows.map((row) => ({
      id: row.public_id,
      name: row.name,
      description: row.description,
      memberCount: row._count.community_members,
      advisors: row.community_advisors.flatMap((a) => {
        const summary = summaries.get(a.advisor_user_id);
        return summary === undefined ? [] : [summary];
      }),
      archived: row.archived_at !== null,
    }));
  }

  private async requireRow(publicId: string): Promise<CommunityRow> {
    const row = await this.db.communities.findUnique({
      where: { public_id: publicId },
      include: communityInclude,
    });
    if (row === null) throw new NotFoundError('Topluluk bulunamadı.');
    return row;
  }

  /** Advisors manage only the communities they advise; admins manage all. */
  private assertCanManage(row: CommunityRow, caller: AuthContext): void {
    if (caller.role === 'admin') return;
    if (
      caller.role === 'advisor' &&
      row.community_advisors.some((a) => a.advisor_user_id === caller.userId)
    ) {
      return;
    }
    throw new ForbiddenError('Bu topluluğu yönetme yetkiniz yok.');
  }

  async list(query: PageQuery & { q?: string | undefined }): Promise<Page<CommunityView>> {
    const rows = await this.db.communities.findMany({
      where: {
        ...(query.q === undefined ? {} : { name: { contains: query.q, mode: 'insensitive' } }),
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      include: communityInclude,
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const page = toPage(rows, query.limit, (row) => row);
    return { items: await this.toViews(page.items), page: page.page };
  }

  async get(publicId: string): Promise<CommunityView> {
    const [view] = await this.toViews([await this.requireRow(publicId)]);
    if (view === undefined) throw new NotFoundError('Topluluk bulunamadı.');
    return view;
  }

  async create(input: { name: string; description: string }): Promise<CommunityView> {
    const row = await this.db.communities.create({
      data: { name: input.name, description: input.description },
      include: communityInclude,
    });
    const [view] = await this.toViews([row]);
    if (view === undefined) throw new NotFoundError('Topluluk bulunamadı.');
    return view;
  }

  async update(
    publicId: string,
    change: {
      name?: string | undefined;
      description?: string | undefined;
      archived?: boolean | undefined;
    },
  ): Promise<CommunityView> {
    const existing = await this.requireRow(publicId);
    const row = await this.db.communities.update({
      where: { id: existing.id },
      data: {
        ...(change.name === undefined ? {} : { name: change.name }),
        ...(change.description === undefined ? {} : { description: change.description }),
        ...(change.archived === undefined
          ? {}
          : { archived_at: change.archived ? (existing.archived_at ?? nowForDb()) : null }),
      },
      include: communityInclude,
    });
    const [view] = await this.toViews([row]);
    if (view === undefined) throw new NotFoundError('Topluluk bulunamadı.');
    return view;
  }

  async listMembers(
    publicId: string,
    caller: AuthContext,
    query: PageQuery,
  ): Promise<Page<UserSummary>> {
    const row = await this.requireRow(publicId);
    this.assertCanManage(row, caller);
    const members = await this.db.community_members.findMany({
      where: { community_id: row.id },
      orderBy: { joined_at: 'desc' },
      select: { user_id: true },
    });
    const summaries = await this.users.summaries(members.map((m) => m.user_id));
    const all = members
      .flatMap((m) => {
        const summary = summaries.get(m.user_id);
        return summary === undefined ? [] : [{ ...summary, public_id: summary.id }];
      })
      .sort((a, b) => (a.public_id < b.public_id ? 1 : -1))
      .filter((m) => query.cursor === undefined || m.public_id < query.cursor);
    return toPage(
      all.slice(0, query.limit + 1),
      query.limit,
      ({ public_id: _ignored, ...summary }) => summary,
    );
  }

  /** Idempotent. Only students can be members. */
  async addMember(publicId: string, caller: AuthContext, userPublicId: string): Promise<void> {
    const row = await this.requireRow(publicId);
    this.assertCanManage(row, caller);
    const user = await this.users.requireByPublicId(userPublicId);
    if (user.role !== 'student') {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'userId', message: 'Yalnızca öğrenciler topluluk üyesi olabilir.' },
      ]);
    }
    await this.db.community_members.upsert({
      where: { community_id_user_id: { community_id: row.id, user_id: user.id } },
      create: { community_id: row.id, user_id: user.id },
      update: {},
    });
  }

  async removeMember(publicId: string, caller: AuthContext, userPublicId: string): Promise<void> {
    const row = await this.requireRow(publicId);
    this.assertCanManage(row, caller);
    const user = await this.users.requireByPublicId(userPublicId);
    await this.db.community_members.deleteMany({
      where: { community_id: row.id, user_id: user.id },
    });
  }

  /** Admin only (enforced by the controller); audited. Only advisors can advise. */
  async addAdvisor(publicId: string, caller: AuthContext, userPublicId: string, requestId: string) {
    const row = await this.requireRow(publicId);
    const user = await this.users.requireByPublicId(userPublicId);
    if (user.role !== 'advisor') {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'userId', message: 'Yalnızca danışmanlar atanabilir.' },
      ]);
    }
    await this.db.community_advisors.upsert({
      where: { community_id_advisor_user_id: { community_id: row.id, advisor_user_id: user.id } },
      create: { community_id: row.id, advisor_user_id: user.id },
      update: {},
    });
    await this.audit.record({
      actorUserId: caller.userId,
      action: 'community.advisor_assigned',
      entityType: 'community',
      entityId: row.id,
      details: { advisor: userPublicId },
      requestId,
    });
  }

  async removeAdvisor(
    publicId: string,
    caller: AuthContext,
    userPublicId: string,
    requestId: string,
  ) {
    const row = await this.requireRow(publicId);
    const user = await this.users.requireByPublicId(userPublicId);
    await this.db.community_advisors.deleteMany({
      where: { community_id: row.id, advisor_user_id: user.id },
    });
    await this.audit.record({
      actorUserId: caller.userId,
      action: 'community.advisor_removed',
      entityType: 'community',
      entityId: row.id,
      details: { advisor: userPublicId },
      requestId,
    });
  }

  /** For the events module: a community the caller may organize for (member, its advisor or admin). */
  async resolveOrganizer(
    publicId: string,
    caller: AuthContext,
  ): Promise<{ id: bigint; advisorIds: bigint[] }> {
    const row = await this.db.communities.findUnique({
      where: { public_id: publicId },
      include: {
        community_advisors: { select: { advisor_user_id: true } },
        community_members: { where: { user_id: caller.userId }, select: { user_id: true } },
      },
    });
    if (row?.archived_at !== null) throw new NotFoundError('Topluluk bulunamadı.');
    const advisorIds = row.community_advisors.map((a) => a.advisor_user_id);
    const allowed =
      caller.role === 'admin' ||
      row.community_members.length > 0 ||
      advisorIds.includes(caller.userId);
    if (!allowed) throw new ForbiddenError('Bu topluluk adına etkinlik oluşturamazsınız.');
    return { id: row.id, advisorIds };
  }

  /** Names for ids owned by other modules, in one query. */
  async summaries(ids: readonly bigint[]): Promise<Map<bigint, CommunitySummary>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.communities.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, public_id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, { id: row.public_id, name: row.name }]));
  }

  /** Communities a user belongs to or advises (used by GET /me). */
  async forUser(userId: bigint): Promise<CommunitySummary[]> {
    const rows = await this.db.communities.findMany({
      where: {
        archived_at: null,
        OR: [
          { community_members: { some: { user_id: userId } } },
          { community_advisors: { some: { advisor_user_id: userId } } },
        ],
      },
      select: { public_id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({ id: row.public_id, name: row.name }));
  }
}
