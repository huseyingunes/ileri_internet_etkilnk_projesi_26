import { Injectable } from '@nestjs/common';
import {
  nowInstant,
  type Page,
  type PageQuery,
  Temporal,
  type UserSummary,
} from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { toPage } from '../../common/pagination.js';
import { isoFromDb, nowForDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type EventSummaryView, EventsService } from '../events/events.service.js';
import { UsersService } from '../identity/users.service.js';
import { Notifier } from '../notifications/notifier.service.js';
import {
  type ApplicationView,
  ApplicationsQuery,
  toApplicationView,
} from './applications.query.js';

type Status = 'confirmed' | 'waitlisted' | 'cancelled';

/** Pure capacity rule: a free seat confirms, otherwise the next waiting-list position. */
export function placement(confirmed: number, capacity: number, lastPosition: number | null) {
  return confirmed < capacity
    ? { status: 'confirmed' as const, position: null }
    : { status: 'waitlisted' as const, position: (lastPosition ?? 0) + 1 };
}

/**
 * Applications, capacity and the waiting list. Every change takes a row lock on
 * the event (SELECT ... FOR UPDATE) inside a transaction, so concurrent
 * applications can never confirm more students than the capacity.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly users: UsersService,
    private readonly query: ApplicationsQuery,
    private readonly notifier: Notifier,
  ) {}

  private async lockEvent(tx: Prisma.TransactionClient, eventId: bigint) {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
  }

  /** Idempotent: an active application is returned as is; a cancelled one is reactivated. */
  async apply(
    caller: AuthContext,
    eventPublicId: string,
  ): Promise<{ created: boolean; application: ApplicationView }> {
    const event = await this.events.findInternal(eventPublicId);
    if (event === null) throw new NotFoundError('Etkinlik bulunamadı.');
    if (event.status !== 'scheduled') {
      throw new ConflictError('Yalnızca takvimdeki etkinliklere başvurulabilir.');
    }
    if (
      Temporal.Instant.compare(Temporal.Instant.from(isoFromDb(event.starts_at)), nowInstant()) <= 0
    ) {
      throw new ConflictError('Başlamış etkinliğe başvurulamaz.');
    }

    const result = await this.db.$transaction(async (tx) => {
      await this.lockEvent(tx, event.id);
      const existing = await tx.applications.findUnique({
        where: { student_user_id_event_id: { student_user_id: caller.userId, event_id: event.id } },
      });
      if (existing !== null && existing.status !== 'cancelled')
        return { created: false, row: existing };

      const confirmed = await tx.applications.count({
        where: { event_id: event.id, status: 'confirmed' },
      });
      const last = await tx.applications.aggregate({
        where: { event_id: event.id, status: 'waitlisted' },
        _max: { waitlist_position: true },
      });
      const place = placement(confirmed, event.capacity, last._max.waitlist_position);
      const data = {
        status: place.status,
        waitlist_position: place.position,
        applied_at: nowForDb(),
        confirmed_at: place.status === 'confirmed' ? nowForDb() : null,
        cancelled_at: null,
      };
      const row =
        existing === null
          ? await tx.applications.create({
              data: { ...data, event_id: event.id, student_user_id: caller.userId },
            })
          : await tx.applications.update({ where: { id: existing.id }, data });
      return { created: true, row };
    });

    if (result.created && result.row.status === 'confirmed') {
      await this.notifier.notify([
        {
          userId: caller.userId,
          type: 'application_confirmed',
          title: 'Başvurunuz onaylandı',
          body: `"${event.title}" etkinliğine başvurunuz onaylandı. Katılımınızı QR kodu ve konumla doğrulamayı unutmayın.`,
          link: `/etkinlikler/${eventPublicId}`,
          dedupeKey: `application_confirmed:${result.row.public_id}:${isoFromDb(result.row.applied_at)}`,
        },
      ]);
    }
    const rank =
      result.row.status === 'waitlisted' && result.row.waitlist_position !== null
        ? await this.query.rankOnWaitlist(event.id, result.row.waitlist_position)
        : undefined;
    return {
      created: result.created,
      application: toApplicationView(result.row, eventPublicId, rank),
    };
  }

  /** Owner cancels; a freed seat goes to the first student on the waiting list. Idempotent. */
  async cancel(caller: AuthContext, applicationPublicId: string): Promise<void> {
    const row = await this.db.applications.findUnique({
      where: { public_id: applicationPublicId },
    });
    if (row === null) throw new NotFoundError('Başvuru bulunamadı.');
    if (row.student_user_id !== caller.userId)
      throw new ForbiddenError('Bu başvuruyu iptal etme yetkiniz yok.');
    if (row.status === 'cancelled') return;
    const event = await this.db.events.findUniqueOrThrow({ where: { id: row.event_id } });
    if (event.status === 'completed')
      throw new ConflictError('Gerçekleşmiş etkinliğin başvurusu iptal edilemez.');

    const promoted = await this.db.$transaction(async (tx) => {
      await this.lockEvent(tx, row.event_id);
      const current = await tx.applications.findUniqueOrThrow({ where: { id: row.id } });
      if (current.status === 'cancelled') return null;
      await tx.applications.update({
        where: { id: row.id },
        data: { status: 'cancelled', waitlist_position: null, cancelled_at: nowForDb() },
      });
      if (current.status !== 'confirmed') return null;
      const next = await tx.applications.findFirst({
        where: { event_id: row.event_id, status: 'waitlisted' },
        orderBy: { waitlist_position: 'asc' },
      });
      if (next === null) return null;
      return await tx.applications.update({
        where: { id: next.id },
        data: { status: 'confirmed', waitlist_position: null, confirmed_at: nowForDb() },
      });
    });
    if (promoted !== null) {
      await this.notifier.notify([
        {
          userId: promoted.student_user_id,
          type: 'application_promoted',
          title: 'Bekleme listesinden yer açıldı',
          body: `"${event.title}" etkinliğinde yer açıldı; başvurunuz onaylandı.`,
          link: `/etkinlikler/${event.public_id}`,
          dedupeKey: `application_promoted:${promoted.public_id}:${isoFromDb(promoted.applied_at)}`,
        },
      ]);
    }
  }

  /** Advisor of the event (or admin): who applied and who is waiting. */
  async listForEvent(
    caller: AuthContext,
    eventPublicId: string,
    query: PageQuery & { status?: Status | undefined },
  ): Promise<Page<ApplicationView & { student: UserSummary }>> {
    const event = await this.events.findInternal(eventPublicId);
    if (event === null) throw new NotFoundError('Etkinlik bulunamadı.');
    if (caller.role !== 'admin' && event.advisor_user_id !== caller.userId) {
      throw new ForbiddenError('Bu etkinliğin başvurularını görme yetkiniz yok.');
    }
    const rows = await this.db.applications.findMany({
      where: {
        event_id: event.id,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const students = await this.users.summaries(rows.map((r) => r.student_user_id));
    return toPage(rows, query.limit, (row) => {
      const student = students.get(row.student_user_id);
      if (student === undefined) throw new NotFoundError('Kullanıcı bulunamadı.');
      return { ...toApplicationView(row, eventPublicId), student };
    });
  }

  async mine(
    caller: AuthContext,
    query: PageQuery & { status?: Status | undefined },
  ): Promise<Page<ApplicationView & { event: EventSummaryView }>> {
    const rows = await this.db.applications.findMany({
      where: {
        student_user_id: caller.userId,
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const events = await this.events.summaries(
      rows.map((r) => r.event_id),
      caller,
    );
    const page = toPage(rows, query.limit, (row) => row);
    const items = [];
    for (const row of page.items) {
      const event = events.get(row.event_id);
      if (event === undefined) continue;
      const rank =
        row.status === 'waitlisted' && row.waitlist_position !== null
          ? await this.query.rankOnWaitlist(row.event_id, row.waitlist_position)
          : undefined;
      items.push({ ...toApplicationView(row, event.id, rank), event });
    }
    return { items, page: page.page };
  }
}
