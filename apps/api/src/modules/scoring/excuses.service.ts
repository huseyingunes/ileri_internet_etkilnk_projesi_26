import { Injectable } from '@nestjs/common';
import {
  excuseReversalPoints,
  nowInstant,
  type Page,
  type PageQuery,
  Temporal,
  type UserSummary,
} from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { toPage } from '../../common/pagination.js';
import { fromDbDate, isoFromDb, toDbDate } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { ApplicationsQuery } from '../applications/applications.query.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { EventsService } from '../events/events.service.js';
import { AuditService } from '../identity/audit.service.js';
import { UsersService } from '../identity/users.service.js';
import { ScoringService } from './scoring.service.js';

/** Excuses may be submitted until a week after the event ends. */
const EXCUSE_DEADLINE_DAYS = 7;

export interface ExcuseView {
  id: string;
  eventId: string;
  student: UserSummary;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
  createdAt: string;
}

interface ExcuseRow {
  public_id: string;
  student_user_id: bigint;
  reason: string;
  status: string;
  reviewed_at: Date | null;
  created_at: Date;
}

const parseStatus = (value: string): ExcuseView['status'] =>
  value === 'approved' || value === 'rejected' ? value : 'pending';

/**
 * Excuses: an approved excuse means no points are lost for the event. When it
 * is approved after scoring, a compensating `excuse_reversal` entry is written
 * (the ledger itself is never changed).
 */
@Injectable()
export class ExcusesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly applications: ApplicationsQuery,
    private readonly attendance: AttendanceService,
    private readonly users: UsersService,
    private readonly scoring: ScoringService,
    private readonly audit: AuditService,
  ) {}

  private async requireEvent(publicId: string) {
    const event = await this.events.findInternal(publicId);
    if (event === null) throw new NotFoundError('Etkinlik bulunamadı.');
    return event;
  }

  private async views(eventPublicId: string, rows: ExcuseRow[]): Promise<ExcuseView[]> {
    const people = await this.users.summaries(rows.map((r) => r.student_user_id));
    return rows.flatMap((row) => {
      const student = people.get(row.student_user_id);
      return student === undefined
        ? []
        : [
            {
              id: row.public_id,
              eventId: eventPublicId,
              student,
              reason: row.reason,
              status: parseStatus(row.status),
              ...(row.reviewed_at === null ? {} : { reviewedAt: isoFromDb(row.reviewed_at) }),
              createdAt: isoFromDb(row.created_at),
            },
          ];
    });
  }

  async submit(caller: AuthContext, eventPublicId: string, reason: string): Promise<ExcuseView> {
    const event = await this.requireEvent(eventPublicId);
    if (event.status !== 'scheduled' && event.status !== 'completed') {
      throw new ConflictError('Bu etkinlik için mazeret bildirilemez.');
    }
    const deadline = fromDbDate(event.ends_at).add({ hours: 24 * EXCUSE_DEADLINE_DAYS });
    if (Temporal.Instant.compare(nowInstant(), deadline) > 0) {
      throw new ConflictError('Mazeret bildirme süresi geçti.');
    }
    const confirmed = await this.applications.confirmedStudents(event.id);
    if (!confirmed.includes(caller.userId)) {
      throw new ConflictError('Bu etkinliğe onaylı başvurunuz yok.');
    }
    const existing = await this.db.excuses.findFirst({
      where: { event_id: event.id, student_user_id: caller.userId },
    });
    if (existing !== null) throw new ConflictError('Bu etkinlik için zaten mazeret bildirdiniz.');
    const row = await this.db.excuses.create({
      data: { event_id: event.id, student_user_id: caller.userId, reason },
    });
    const [view] = await this.views(event.public_id, [row]);
    if (view === undefined) throw new Error('excuse view missing');
    return view;
  }

  private canReview(caller: AuthContext, advisorId: bigint | null): boolean {
    return caller.role === 'admin' || advisorId === caller.userId;
  }

  async list(
    caller: AuthContext,
    eventPublicId: string,
    status: ExcuseView['status'] | undefined,
    query: PageQuery,
  ): Promise<Page<ExcuseView>> {
    const event = await this.requireEvent(eventPublicId);
    if (!this.canReview(caller, event.advisor_user_id)) {
      throw new ForbiddenError('Bu etkinliğin mazeretlerini görme yetkiniz yok.');
    }
    const rows = await this.db.excuses.findMany({
      where: {
        event_id: event.id,
        ...(status === undefined ? {} : { status }),
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const page = toPage(rows, query.limit, (row) => row);
    return { items: await this.views(event.public_id, page.items), page: page.page };
  }

  async review(
    caller: AuthContext & { requestId: string },
    excusePublicId: string,
    decision: 'approve' | 'reject',
  ): Promise<ExcuseView> {
    const excuse = await this.db.excuses.findUnique({ where: { public_id: excusePublicId } });
    if (excuse === null) throw new NotFoundError('Mazeret bulunamadı.');
    const event = await this.events.findInternalById(excuse.event_id);
    if (event === null) throw new NotFoundError('Etkinlik bulunamadı.');
    if (!this.canReview(caller, event.advisor_user_id)) {
      throw new ForbiddenError('Bu mazereti değerlendirme yetkiniz yok.');
    }
    const status = decision === 'approve' ? 'approved' : 'rejected';
    const updated = await this.db.excuses.updateMany({
      where: { id: excuse.id, status: 'pending' },
      data: {
        status,
        reviewed_by_user_id: caller.userId,
        reviewed_at: toDbDate(nowInstant()),
      },
    });
    if (updated.count === 0) throw new ConflictError('Bu mazeret zaten değerlendirildi.');

    if (status === 'approved') {
      await this.attendance.markExcused(event.id, excuse.student_user_id);
      const entries = await this.scoring.entriesFor(excuse.student_user_id, event.id);
      const points = excuseReversalPoints(entries);
      const seasonId = entries[0]?.seasonId;
      if (points !== 0 && seasonId !== undefined) {
        await this.scoring.writeReversal(seasonId, excuse.student_user_id, event.id, points);
      }
    }
    await this.audit.record({
      actorUserId: caller.userId,
      action: `excuse.${status}`,
      entityType: 'excuse',
      entityId: excuse.id,
      requestId: caller.requestId,
    });
    const row = await this.db.excuses.findUniqueOrThrow({ where: { id: excuse.id } });
    const [view] = await this.views(event.public_id, [row]);
    if (view === undefined) throw new Error('excuse view missing');
    return view;
  }
}
