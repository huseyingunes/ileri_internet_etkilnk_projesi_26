import { Injectable } from '@nestjs/common';
import {
  type Category,
  categorySchema,
  type CommunitySummary,
  type EventStatus,
  type Instant,
  eventStatusSchema,
  type Page,
  type PageQuery,
  Temporal,
  type UserSummary,
} from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors.js';
import { toPage } from '../../common/pagination.js';
import { isoFromDb, nowForDb, toDbDate } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type ApplicationView, ApplicationsQuery } from '../applications/applications.query.js';
import { CommunitiesService } from '../communities/communities.service.js';
import { AuditService } from '../identity/audit.service.js';
import { UsersService } from '../identity/users.service.js';
import { type MediaView, MediaService } from '../media/media.service.js';
import {
  canCancel,
  canEdit,
  canManagePhotos,
  canReview,
  canView,
  type EventFacts,
  initialStatus,
  PUBLIC_STATUSES,
  SCHEDULED_EDITABLE,
} from './event-policy.js';

export interface EventInput {
  title: string;
  description: string;
  category: Category;
  organizerCommunityId?: string | undefined;
  advisorId?: string | undefined;
  startsAt: string;
  endsAt: string;
  location: { name: string; latitude: number; longitude: number };
  capacity: number;
  attendanceRadiusM: number;
  qrRefreshSeconds: number;
  participationRequirements: string;
  tags: string[];
}

export type EventChange = {
  [K in keyof Omit<EventInput, 'category' | 'organizerCommunityId' | 'advisorId'>]?:
    EventInput[K] | undefined;
};

export interface EventSummaryView {
  id: string;
  title: string;
  category: Category;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  location: { name: string; latitude: number; longitude: number };
  organizer: { kind: 'user' | 'community'; id: string; name: string };
  capacity: number;
  cover?: MediaView;
  tags: string[];
}

export interface EventView extends EventSummaryView {
  description: string;
  participationRequirements: string;
  advisor?: UserSummary;
  attendanceRadiusM: number;
  qrRefreshSeconds: number;
  rejectionReason?: string;
  cancellationReason?: string;
  createdAt: string;
  confirmedCount: number;
  waitlistCount: number;
  viewer: {
    canEdit: boolean;
    canReview: boolean;
    canManagePhotos: boolean;
    application?: ApplicationView;
  };
}

const eventInclude = {
  event_tags: { select: { tags: { select: { name: true } } } },
} satisfies Prisma.eventsInclude;

/** Gallery size limit per event. */
const MAX_PHOTOS = 50;

type EventRow = Prisma.eventsGetPayload<{ include: typeof eventInclude }>;

const toInstantDate = (value: string) => toDbDate(Temporal.Instant.from(value));

function facts(row: EventRow): EventFacts {
  return {
    status: eventStatusSchema.parse(row.status),
    createdBy: row.created_by_user_id,
    advisor: row.advisor_user_id,
  };
}

/**
 * Event proposals, advisor approval, the pool and the calendar. Owns events,
 * event_tags and tags; people, communities and images come from their modules.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
    private readonly communities: CommunitiesService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly applications: ApplicationsQuery,
  ) {}

  // --- Read side ---------------------------------------------------------------

  private async toViews(rows: EventRow[], caller: AuthContext): Promise<EventView[]> {
    const userIds = rows.flatMap((r) =>
      [r.organizer_user_id, r.advisor_user_id].filter((id) => id !== null),
    );
    const communityIds = rows.flatMap((r) =>
      r.organizer_community_id === null ? [] : [r.organizer_community_id],
    );
    const coverIds = rows.flatMap((r) => (r.cover_media_id === null ? [] : [r.cover_media_id]));
    const [people, communities, covers, counts] = await Promise.all([
      this.users.summaries(userIds),
      this.communities.summaries(communityIds),
      this.media.views(coverIds),
      this.applications.counts(rows.map((r) => r.id)),
    ]);
    return rows.map((row) => ({
      ...this.toView(row, caller, people, communities, covers),
      confirmedCount: counts.get(row.id)?.confirmed ?? 0,
      waitlistCount: counts.get(row.id)?.waitlisted ?? 0,
    }));
  }

  private toView(
    row: EventRow,
    caller: AuthContext,
    people: Map<bigint, UserSummary>,
    communities: Map<bigint, CommunitySummary>,
    covers: Map<bigint, MediaView>,
  ): Omit<EventView, 'confirmedCount' | 'waitlistCount'> {
    const community =
      row.organizer_community_id === null ? undefined : communities.get(row.organizer_community_id);
    const person = row.organizer_user_id === null ? undefined : people.get(row.organizer_user_id);
    const organizer =
      community !== undefined
        ? { kind: 'community' as const, id: community.id, name: community.name }
        : { kind: 'user' as const, id: person?.id ?? '', name: person?.displayName ?? '' };
    const advisor = row.advisor_user_id === null ? undefined : people.get(row.advisor_user_id);
    const cover = row.cover_media_id === null ? undefined : covers.get(row.cover_media_id);
    const f = facts(row);
    const who = { userId: caller.userId, role: caller.role };
    return {
      id: row.public_id,
      title: row.title,
      category: categorySchema.parse(row.category),
      status: f.status,
      startsAt: isoFromDb(row.starts_at),
      endsAt: isoFromDb(row.ends_at),
      location: { name: row.location_name, latitude: row.latitude, longitude: row.longitude },
      organizer,
      capacity: row.capacity,
      ...(cover === undefined ? {} : { cover }),
      tags: row.event_tags.map((t) => t.tags.name).sort(),
      description: row.description,
      participationRequirements: row.participation_requirements,
      ...(advisor === undefined ? {} : { advisor }),
      attendanceRadiusM: row.attendance_radius_m,
      qrRefreshSeconds: row.qr_refresh_seconds,
      ...(row.rejection_reason === null ? {} : { rejectionReason: row.rejection_reason }),
      ...(row.cancellation_reason === null ? {} : { cancellationReason: row.cancellation_reason }),
      createdAt: isoFromDb(row.created_at),
      viewer: {
        canEdit: canEdit(f, who),
        canReview: canReview(f, who),
        canManagePhotos: canManagePhotos(f, who),
      },
    };
  }

  private visibilityFilter(caller: AuthContext): Prisma.eventsWhereInput {
    if (caller.role === 'admin') return {};
    return {
      OR: [
        { status: { in: [...PUBLIC_STATUSES] } },
        { created_by_user_id: caller.userId },
        { advisor_user_id: caller.userId },
      ],
    };
  }

  async list(
    caller: AuthContext,
    query: PageQuery & {
      status?: EventStatus[] | undefined;
      category?: Category | undefined;
      from?: string | undefined;
      to?: string | undefined;
      mine?: boolean | undefined;
      communityId?: string | undefined;
      tag?: string | undefined;
      q?: string | undefined;
    },
  ): Promise<Page<EventSummaryView>> {
    const filters: Prisma.eventsWhereInput[] = [this.visibilityFilter(caller)];
    if (query.status !== undefined) filters.push({ status: { in: query.status } });
    if (query.category !== undefined) filters.push({ category: query.category });
    if (query.from !== undefined) filters.push({ starts_at: { gte: toInstantDate(query.from) } });
    if (query.to !== undefined) filters.push({ starts_at: { lt: toInstantDate(query.to) } });
    if (query.mine === true) {
      filters.push({
        OR: [{ created_by_user_id: caller.userId }, { advisor_user_id: caller.userId }],
      });
    }
    if (query.communityId !== undefined) {
      filters.push({ communities: { public_id: query.communityId } });
    }
    if (query.tag !== undefined)
      filters.push({ event_tags: { some: { tags: { name: query.tag } } } });
    if (query.q !== undefined) filters.push({ title: { contains: query.q, mode: 'insensitive' } });
    if (query.cursor !== undefined) filters.push({ public_id: { lt: query.cursor } });

    const rows = await this.db.events.findMany({
      where: { AND: filters },
      include: eventInclude,
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const page = toPage(rows, query.limit, (row) => row);
    const views = await this.toViews(page.items, caller);
    return {
      items: views.map(
        ({
          description: _d,
          participationRequirements: _p,
          advisor: _a,
          attendanceRadiusM: _r,
          qrRefreshSeconds: _q,
          rejectionReason: _rr,
          cancellationReason: _c,
          createdAt: _ca,
          viewer: _v,
          confirmedCount: _cc,
          waitlistCount: _wc,
          ...summary
        }) => summary,
      ),
      page: page.page,
    };
  }

  private async requireRow(publicId: string, caller: AuthContext): Promise<EventRow> {
    const row = await this.db.events.findUnique({
      where: { public_id: publicId },
      include: eventInclude,
    });
    // Invisible events answer 404, so their existence is not revealed.
    if (row === null || !canView(facts(row), caller))
      throw new NotFoundError('Etkinlik bulunamadı.');
    return row;
  }

  async get(publicId: string, caller: AuthContext): Promise<EventView> {
    const row = await this.requireRow(publicId, caller);
    const [view] = await this.toViews([row], caller);
    if (view === undefined) throw new NotFoundError('Etkinlik bulunamadı.');
    if (caller.role !== 'student') return view;
    const application = await this.applications.forStudent(row.id, row.public_id, caller.userId);
    return application === undefined ? view : { ...view, viewer: { ...view.viewer, application } };
  }

  /** Summaries for event ids owned by other modules (one query each for events and relations). */
  async summaries(
    ids: readonly bigint[],
    caller: AuthContext,
  ): Promise<Map<bigint, EventSummaryView>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.events.findMany({
      where: { id: { in: [...new Set(ids)] } },
      include: eventInclude,
    });
    const views = await this.toViews(rows, caller);
    return new Map(
      rows.map((row, index) => {
        const view = views[index];
        if (view === undefined) throw new Error('view missing');
        const {
          description: _d,
          participationRequirements: _p,
          advisor: _a,
          attendanceRadiusM: _r,
          qrRefreshSeconds: _q,
          rejectionReason: _rr,
          cancellationReason: _c,
          createdAt: _ca,
          viewer: _v,
          confirmedCount: _cc,
          waitlistCount: _wc,
          ...summary
        } = view;
        return [row.id, summary];
      }),
    );
  }

  /** Voting winner goes on the calendar on its own planned date (only from the pool). */
  async scheduleWinner(eventId: bigint, tx: Prisma.TransactionClient = this.db): Promise<void> {
    await tx.events.updateMany({
      where: { id: eventId, status: 'pool' },
      data: { status: 'scheduled' },
    });
  }

  /** For other modules (voting, applications, attendance): internal facts of an event. */
  async findInternal(publicId: string) {
    return await this.db.events.findUnique({ where: { public_id: publicId } });
  }

  /** For reminders: calendar events starting within [from, to). */
  async scheduledStartingBetween(from: Instant, to: Instant) {
    return await this.db.events.findMany({
      where: { status: 'scheduled', starts_at: { gte: toDbDate(from), lt: toDbDate(to) } },
      select: { id: true, public_id: true, title: true, starts_at: true, location_name: true },
    });
  }

  /** Titles and public ids for events referenced by other modules. */
  async titles(ids: readonly bigint[]): Promise<Map<bigint, { publicId: string; title: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.events.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, public_id: true, title: true },
    });
    return new Map(rows.map((r) => [r.id, { publicId: r.public_id, title: r.title }]));
  }

  /** Tag ids per event, in one query. */
  async tagIdsOfMany(eventIds: readonly bigint[]): Promise<Map<bigint, bigint[]>> {
    if (eventIds.length === 0) return new Map();
    const rows = await this.db.event_tags.findMany({
      where: { event_id: { in: [...new Set(eventIds)] } },
    });
    const map = new Map<bigint, bigint[]>();
    for (const row of rows) map.set(row.event_id, [...(map.get(row.event_id) ?? []), row.tag_id]);
    return map;
  }

  /** Tag ids for names, creating missing tags (shared vocabulary with interests). */
  async ensureTags(names: readonly string[]): Promise<bigint[]> {
    const ids: bigint[] = [];
    for (const name of [...new Set(names)]) {
      const tag = await this.db.tags.upsert({ where: { name }, create: { name }, update: {} });
      ids.push(tag.id);
    }
    return ids;
  }

  async tagIdsOf(eventId: bigint): Promise<bigint[]> {
    const rows = await this.db.event_tags.findMany({ where: { event_id: eventId } });
    return rows.map((r) => r.tag_id);
  }

  async findInternalById(id: bigint) {
    return await this.db.events.findUnique({ where: { id } });
  }

  // --- Write side --------------------------------------------------------------

  private async replaceTags(
    tx: Prisma.TransactionClient,
    eventId: bigint,
    tags: string[],
  ): Promise<void> {
    await tx.event_tags.deleteMany({ where: { event_id: eventId } });
    for (const name of [...new Set(tags)]) {
      const tag = await tx.tags.upsert({ where: { name }, create: { name }, update: {} });
      await tx.event_tags.create({ data: { event_id: eventId, tag_id: tag.id } });
    }
  }

  async create(caller: AuthContext, input: EventInput): Promise<EventView> {
    const community =
      input.organizerCommunityId === undefined
        ? undefined
        : await this.communities.resolveOrganizer(input.organizerCommunityId, caller);

    let advisorId: bigint | undefined;
    if (input.advisorId !== undefined) {
      const advisor = await this.users.requireByPublicId(input.advisorId);
      if (advisor.role !== 'advisor') {
        throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
          { field: 'advisorId', message: 'Seçilen kişi danışman değil.' },
        ]);
      }
      advisorId = advisor.id;
    } else if (community?.advisorIds[0] !== undefined) {
      advisorId = community.advisorIds[0];
    } else if (caller.role === 'advisor') {
      advisorId = caller.userId;
    }
    if (caller.role === 'student' && advisorId === undefined) {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'advisorId', message: 'Önerinizi onaylayacak danışmanı seçin.' },
      ]);
    }

    const status = initialStatus(caller.role);
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.events.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          status,
          organizer_user_id: community === undefined ? caller.userId : null,
          organizer_community_id: community?.id ?? null,
          created_by_user_id: caller.userId,
          advisor_user_id: advisorId ?? null,
          starts_at: toInstantDate(input.startsAt),
          ends_at: toInstantDate(input.endsAt),
          location_name: input.location.name,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          attendance_radius_m: input.attendanceRadiusM,
          qr_refresh_seconds: input.qrRefreshSeconds,
          capacity: input.capacity,
          participation_requirements: input.participationRequirements,
          ...(status === 'pool'
            ? { approved_by_user_id: caller.userId, approved_at: nowForDb() }
            : {}),
        },
      });
      await this.replaceTags(tx, created.id, input.tags);
      return await tx.events.findUniqueOrThrow({
        where: { id: created.id },
        include: eventInclude,
      });
    });
    const [view] = await this.toViews([row], caller);
    if (view === undefined) throw new NotFoundError('Etkinlik bulunamadı.');
    return view;
  }

  async update(publicId: string, caller: AuthContext, change: EventChange): Promise<EventView> {
    const row = await this.requireRow(publicId, caller);
    const f = facts(row);
    if (!canEdit(f, caller)) {
      if (f.status === 'completed' || f.status === 'cancelled') {
        throw new ConflictError('Gerçekleşmiş ya da iptal edilmiş etkinlik değiştirilemez.');
      }
      throw new ForbiddenError('Bu etkinliği düzenleme yetkiniz yok.');
    }
    if (
      f.status === 'scheduled' &&
      Object.keys(change).some((key) => !SCHEDULED_EDITABLE.has(key))
    ) {
      throw new ConflictError(
        'Takvimdeki etkinlikte yalnızca açıklama, katılım koşulları ve etiketler değişebilir.',
      );
    }
    const startsAt = change.startsAt ?? isoFromDb(row.starts_at);
    const endsAt = change.endsAt ?? isoFromDb(row.ends_at);
    if (
      Temporal.Instant.compare(Temporal.Instant.from(endsAt), Temporal.Instant.from(startsAt)) <= 0
    ) {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'endsAt', message: 'Bitiş başlangıçtan sonra olmalı.' },
      ]);
    }
    // A student editing a rejected proposal sends it back for approval.
    const resubmit = f.status === 'rejected' && caller.role === 'student';

    const updated = await this.db.$transaction(async (tx) => {
      await tx.events.update({
        where: { id: row.id },
        data: {
          ...(change.title === undefined ? {} : { title: change.title }),
          ...(change.description === undefined ? {} : { description: change.description }),
          ...(change.startsAt === undefined ? {} : { starts_at: toInstantDate(change.startsAt) }),
          ...(change.endsAt === undefined ? {} : { ends_at: toInstantDate(change.endsAt) }),
          ...(change.location === undefined
            ? {}
            : {
                location_name: change.location.name,
                latitude: change.location.latitude,
                longitude: change.location.longitude,
              }),
          ...(change.capacity === undefined ? {} : { capacity: change.capacity }),
          ...(change.attendanceRadiusM === undefined
            ? {}
            : { attendance_radius_m: change.attendanceRadiusM }),
          ...(change.qrRefreshSeconds === undefined
            ? {}
            : { qr_refresh_seconds: change.qrRefreshSeconds }),
          ...(change.participationRequirements === undefined
            ? {}
            : { participation_requirements: change.participationRequirements }),
          ...(resubmit ? { status: 'pending_approval', rejection_reason: null } : {}),
        },
      });
      if (change.tags !== undefined) await this.replaceTags(tx, row.id, change.tags);
      return await tx.events.findUniqueOrThrow({ where: { id: row.id }, include: eventInclude });
    });
    const [view] = await this.toViews([updated], caller);
    if (view === undefined) throw new NotFoundError('Etkinlik bulunamadı.');
    return view;
  }

  async review(
    publicId: string,
    caller: AuthContext,
    decision: { decision: 'approve' | 'reject'; reason?: string | undefined },
  ): Promise<EventView> {
    const row = await this.requireRow(publicId, caller);
    const f = facts(row);
    if (f.status !== 'pending_approval') throw new ConflictError('Etkinlik onay beklemiyor.');
    if (!canReview(f, caller)) throw new ForbiddenError('Bu etkinliği inceleme yetkiniz yok.');
    // Conditional update: two concurrent reviews cannot both succeed.
    const result = await this.db.events.updateMany({
      where: { id: row.id, status: 'pending_approval' },
      data:
        decision.decision === 'approve'
          ? { status: 'pool', approved_by_user_id: caller.userId, approved_at: nowForDb() }
          : { status: 'rejected', rejection_reason: decision.reason ?? '' },
    });
    if (result.count === 0) throw new ConflictError('Etkinlik onay beklemiyor.');
    return await this.get(publicId, caller);
  }

  async cancel(
    publicId: string,
    caller: AuthContext,
    reason: string,
    requestId: string,
  ): Promise<EventView> {
    const row = await this.requireRow(publicId, caller);
    const f = facts(row);
    if (!canCancel(f, caller)) {
      if (f.status === 'completed' || f.status === 'cancelled') {
        throw new ConflictError('Etkinlik zaten gerçekleşmiş ya da iptal edilmiş.');
      }
      throw new ForbiddenError('Bu etkinliği iptal etme yetkiniz yok.');
    }
    await this.db.events.update({
      where: { id: row.id },
      data: { status: 'cancelled', cancelled_at: nowForDb(), cancellation_reason: reason },
    });
    await this.audit.record({
      actorUserId: caller.userId,
      action: 'event.cancelled',
      entityType: 'event',
      entityId: row.id,
      details: { fromStatus: f.status },
      requestId,
    });
    return await this.get(publicId, caller);
  }

  async setCover(
    publicId: string,
    caller: AuthContext,
    mediaPublicId: string | null,
  ): Promise<EventView> {
    const row = await this.requireRow(publicId, caller);
    if (!canEdit(facts(row), caller))
      throw new ForbiddenError('Bu etkinliği düzenleme yetkiniz yok.');
    const mediaId =
      mediaPublicId === null ? null : await this.media.requireAttachable(caller, mediaPublicId);
    await this.db.events.update({ where: { id: row.id }, data: { cover_media_id: mediaId } });
    return await this.get(publicId, caller);
  }

  // --- Photo gallery (prompt: photos are uploaded by the advisor or an admin) ---

  async listPhotos(publicId: string, caller: AuthContext): Promise<{ items: MediaView[] }> {
    const row = await this.requireRow(publicId, caller);
    const photos = await this.db.event_photos.findMany({
      where: { event_id: row.id },
      orderBy: [{ sort_order: 'asc' }, { media_id: 'asc' }],
    });
    const views = await this.media.views(photos.map((p) => p.media_id));
    return {
      items: photos.flatMap((p) => {
        const view = views.get(p.media_id);
        return view?.status === 'ready' ? [view] : [];
      }),
    };
  }

  async addPhoto(publicId: string, caller: AuthContext, mediaPublicId: string): Promise<void> {
    const row = await this.requireRow(publicId, caller);
    if (!canManagePhotos(facts(row), caller))
      throw new ForbiddenError('Bu etkinliğe fotoğraf ekleme yetkiniz yok.');
    if (row.status !== 'scheduled' && row.status !== 'completed') {
      throw new ConflictError('Fotoğraf yalnızca takvimdeki ya da gerçekleşen etkinliğe eklenir.');
    }
    const mediaId = await this.media.requireAttachable(caller, mediaPublicId);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('event-photos', ${row.id}))`;
      const count = await tx.event_photos.count({ where: { event_id: row.id } });
      if (count >= MAX_PHOTOS) {
        throw new ConflictError(`Bir etkinliğe en fazla ${String(MAX_PHOTOS)} fotoğraf eklenir.`);
      }
      await tx.event_photos.createMany({
        data: [{ event_id: row.id, media_id: mediaId, sort_order: count }],
        skipDuplicates: true,
      });
    });
  }

  async removePhoto(publicId: string, caller: AuthContext, mediaPublicId: string): Promise<void> {
    const row = await this.requireRow(publicId, caller);
    if (!canManagePhotos(facts(row), caller))
      throw new ForbiddenError('Bu etkinliğin fotoğraflarını yönetme yetkiniz yok.');
    const removed = await this.db.event_photos.deleteMany({
      where: { event_id: row.id, media_objects: { public_id: mediaPublicId } },
    });
    if (removed.count === 0) throw new NotFoundError('Fotoğraf bulunamadı.');
  }
}
