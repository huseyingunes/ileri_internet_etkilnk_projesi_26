import { Injectable } from '@nestjs/common';
import {
  type Instant,
  type Page,
  type PageQuery,
  REASON_QUESTIONS,
  type ReasonKind,
} from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { toPage } from '../../common/pagination.js';
import { isoFromDb, toDbDate } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { type EventSummaryView, EventsService } from '../events/events.service.js';
import { VotingService } from '../voting/voting.service.js';

export interface ReasonPromptView {
  id: string;
  event: EventSummaryView;
  kind: ReasonKind;
  question: string;
  sentAt: string;
  answeredAt?: string;
}

const parseKind = (value: string): ReasonKind =>
  value === 'why_attended' ? 'why_attended' : 'why_not_attended';

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * "Why" questions and ratings (prompt section 2, items 8 and 9). Owns
 * reason_prompts, reason_answers and ratings.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly voting: VotingService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * After a winning event completes, every student who voted for it gets one
   * open question: why they came, or why they did not. Students on the
   * waiting list or with an approved excuse are not asked (the reason is
   * known). Idempotent through the (event, student) unique constraint.
   */
  async createPrompts(eventId: bigint): Promise<number> {
    const choices = await this.voting.voteChoicesForEvent(eventId);
    if (choices === null) return 0;
    const outcomes = await this.attendance.finalOutcomes(eventId);
    const data = [...choices.entries()].flatMap(([studentId, choice]) => {
      if (choice !== 'winner') return [];
      const outcome = outcomes.get(studentId);
      if (outcome === 'blocked_by_capacity' || outcome === 'excused') return [];
      const kind: ReasonKind = outcome === 'attended' ? 'why_attended' : 'why_not_attended';
      return [{ event_id: eventId, student_user_id: studentId, kind }];
    });
    const result = await this.db.reason_prompts.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  /** Students asked a "why" question about the event. */
  async promptRecipients(eventId: bigint): Promise<bigint[]> {
    const rows = await this.db.reason_prompts.findMany({
      where: { event_id: eventId },
      select: { student_user_id: true },
    });
    return rows.map((r) => r.student_user_id);
  }

  /** For inferred interests: ratings of 4 or 5 since an instant. */
  async goodRatingsSince(since: Instant): Promise<{ userId: bigint; eventId: bigint }[]> {
    const rows = await this.db.ratings.findMany({
      where: { score: { gte: 4 }, created_at: { gte: toDbDate(since) } },
      select: { student_user_id: true, event_id: true },
    });
    return rows.map((r) => ({ userId: r.student_user_id, eventId: r.event_id }));
  }

  async myPrompts(caller: AuthContext, answered: boolean): Promise<{ items: ReasonPromptView[] }> {
    const rows = await this.db.reason_prompts.findMany({
      where: {
        student_user_id: caller.userId,
        reason_answers: answered ? { isNot: null } : { is: null },
      },
      include: { reason_answers: { select: { answered_at: true } } },
      orderBy: { sent_at: 'desc' },
      take: 100,
    });
    const events = await this.events.summaries(
      rows.map((r) => r.event_id),
      caller,
    );
    return {
      items: rows.flatMap((row) => {
        const event = events.get(row.event_id);
        if (event === undefined) return [];
        const kind = parseKind(row.kind);
        const answeredAt = row.reason_answers?.answered_at;
        return [
          {
            id: row.public_id,
            event,
            kind,
            question: REASON_QUESTIONS[kind],
            sentAt: isoFromDb(row.sent_at),
            ...(answeredAt === undefined ? {} : { answeredAt: isoFromDb(answeredAt) }),
          },
        ];
      }),
    };
  }

  /** One answer per question; only the student it was asked to. */
  async answer(caller: AuthContext, promptPublicId: string, answer: string): Promise<void> {
    const prompt = await this.db.reason_prompts.findUnique({
      where: { public_id: promptPublicId },
    });
    if (prompt?.student_user_id !== caller.userId) throw new NotFoundError('Soru bulunamadı.');
    const created = await this.db.reason_answers.createMany({
      data: [{ reason_prompt_id: prompt.id, answer }],
      skipDuplicates: true,
    });
    if (created.count === 0) throw new ConflictError('Bu soruyu zaten yanıtladınız.');
  }

  /** Only students whose attendance was verified, once, after the event. */
  async rate(
    caller: AuthContext,
    eventPublicId: string,
    input: { score: number; comment?: string | undefined },
  ) {
    const event = await this.events.findInternal(eventPublicId);
    if (event === null) throw new NotFoundError('Etkinlik bulunamadı.');
    const statuses = await this.attendance.statusesOf(caller.userId, [event.id]);
    if (event.status !== 'completed' || statuses.get(event.id) !== 'attended') {
      throw new ForbiddenError('Yalnızca katılımı doğrulanan öğrenciler değerlendirme yapabilir.');
    }
    const created = await this.db.ratings.createMany({
      data: [
        {
          event_id: event.id,
          student_user_id: caller.userId,
          score: input.score,
          comment: input.comment ?? null,
        },
      ],
      skipDuplicates: true,
    });
    if (created.count === 0) throw new ConflictError('Bu etkinliği zaten değerlendirdiniz.');
    const row = await this.db.ratings.findFirstOrThrow({
      where: { event_id: event.id, student_user_id: caller.userId },
    });
    return {
      score: row.score,
      ...(row.comment === null ? {} : { comment: row.comment }),
      createdAt: isoFromDb(row.created_at),
    };
  }

  async ratingStats(
    eventId: bigint,
  ): Promise<{ averageRating: number | null; ratingCount: number }> {
    const stats = await this.db.ratings.aggregate({
      where: { event_id: eventId },
      _avg: { score: true },
      _count: { _all: true },
    });
    const average = stats._avg.score;
    return {
      averageRating: average === null ? null : round2(average),
      ratingCount: stats._count._all,
    };
  }

  /** Average and anonymous comments; only the event's advisor or an admin. */
  async ratingReport(
    caller: AuthContext,
    eventPublicId: string,
    query: PageQuery,
  ): Promise<
    Page<{ score: number; comment?: string; createdAt: string }> & {
      averageRating: number | null;
      ratingCount: number;
    }
  > {
    const event = await this.events.findInternal(eventPublicId);
    if (event === null) throw new NotFoundError('Etkinlik bulunamadı.');
    if (caller.role !== 'admin' && event.advisor_user_id !== caller.userId) {
      throw new ForbiddenError('Bu etkinliğin değerlendirmelerini görme yetkiniz yok.');
    }
    const rows = await this.db.ratings.findMany({
      where: {
        event_id: event.id,
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const page = toPage(rows, query.limit, (row) => ({
      score: row.score,
      ...(row.comment === null ? {} : { comment: row.comment }),
      createdAt: isoFromDb(row.created_at),
    }));
    return { ...(await this.ratingStats(event.id)), ...page };
  }

  /** Archive page of a completed event (prompt section 2, item 10). */
  async archiveSummary(caller: AuthContext, eventPublicId: string) {
    const event = await this.events.get(eventPublicId, caller);
    const internal = await this.events.findInternal(eventPublicId);
    if (internal === null) throw new NotFoundError('Etkinlik bulunamadı.');
    if (internal.status !== 'completed') {
      throw new ConflictError('Arşiv sayfası yalnızca gerçekleşen etkinlikler için vardır.');
    }
    const [participantCount, ratings, voting, photos] = await Promise.all([
      this.attendance.attendedCountOf(internal.id),
      this.ratingStats(internal.id),
      this.voting.resultsForEvent(internal.id, caller),
      this.events.listPhotos(eventPublicId, caller),
    ]);
    return { event, participantCount, ...ratings, voting, photos: photos.items };
  }

  /** For the student's own event page: may they rate, and did they already? */
  async viewerState(caller: AuthContext, eventId: bigint) {
    if (caller.role !== 'student') return { canRate: false, rated: false };
    const statuses = await this.attendance.statusesOf(caller.userId, [eventId]);
    const rating = await this.db.ratings.findFirst({
      where: { event_id: eventId, student_user_id: caller.userId },
      select: { id: true },
    });
    return {
      canRate: statuses.get(eventId) === 'attended' && rating === null,
      rated: rating !== null,
    };
  }
}
