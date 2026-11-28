import { Injectable } from '@nestjs/common';
import {
  CATEGORIES,
  type Category,
  categorySchema,
  decideCategory,
  istanbulDateOf,
  istanbulDayWindow,
  nowInstant,
  type PlainDate,
  Temporal,
} from '@etkinlik/shared';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors.js';
import { isoFromDb, toDbDate } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { RedisService } from '../../infra/redis.js';
import { type EventSummaryView, EventsService } from '../events/events.service.js';
import { SettingsService } from '../settings/settings.service.js';

export const VOTING_CLOSE_JOB = 'voting.close';
const COUNTS_CACHE_SECONDS = 5;
const cachedCountsSchema = z.array(
  z.tuple([z.string().regex(/^[0-9]+$/), z.number().int().nonnegative()]),
);

const dbDate = (date: PlainDate) => toDbDate(Temporal.Instant.from(`${date.toString()}T00:00:00Z`));
const plainDate = (value: Date) => Temporal.PlainDate.from(isoFromDb(value).slice(0, 10));

interface BallotEntryView {
  id: string;
  event: EventSummaryView;
  voteCount: number | null;
}

export interface BallotView {
  date: string;
  opensAt: string;
  closesAt: string;
  categories: Record<Category, BallotEntryView[]>;
  myVotes?: Record<Category, string | null>;
}

export interface VotingResultView {
  id: string;
  date: string;
  category: Category;
  status: 'winner' | 'tie_pending' | 'below_threshold' | 'no_votes';
  totalVotes: number;
  winner?: EventSummaryView;
  tiedEventIds: string[];
  entries: { event: EventSummaryView; voteCount: number }[];
}

/**
 * Daily selection (three pool events per category), voting between 00:00 and
 * 23:59 Istanbul time (one vote per student, day and category), nightly
 * closing and the admin's tie decision. Owns daily_ballots, votes and
 * voting_results; events are changed only through EventsService.
 */
@Injectable()
export class VotingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly events: EventsService,
    private readonly settings: SettingsService,
  ) {}

  today(): PlainDate {
    return istanbulDateOf(nowInstant());
  }

  private async counts(date: PlainDate, ballotIds: bigint[]): Promise<Map<bigint, number>> {
    const cacheKey = `ballot-counts:${date.toString()}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached !== null) {
      const parsed = cachedCountsSchema.safeParse(JSON.parse(cached));
      if (parsed.success) return new Map(parsed.data.map(([id, n]) => [BigInt(id), n]));
    }
    const grouped = await this.db.votes.groupBy({
      by: ['daily_ballot_id'],
      where: { daily_ballot_id: { in: ballotIds } },
      _count: { _all: true },
    });
    const counts = new Map(ballotIds.map((id) => [id, 0]));
    for (const row of grouped) counts.set(row.daily_ballot_id, row._count._all);
    await this.redis.client.set(
      cacheKey,
      JSON.stringify([...counts].map(([id, n]) => [id.toString(), n])),
      'EX',
      COUNTS_CACHE_SECONDS,
    );
    return counts;
  }

  async ballot(caller: AuthContext, dateText?: string): Promise<BallotView> {
    const date = dateText === undefined ? this.today() : Temporal.PlainDate.from(dateText);
    const rows = await this.db.daily_ballots.findMany({
      where: { voting_date: dbDate(date) },
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) throw new NotFoundError('Bu gün için oylama yok.');
    const window = istanbulDayWindow(date);
    const closed = Temporal.PlainDate.compare(date, this.today()) < 0;
    const { showLiveVoteCounts } = await this.settings.get();
    const counts =
      closed || showLiveVoteCounts || caller.role === 'admin'
        ? await this.counts(
            date,
            rows.map((r) => r.id),
          )
        : undefined;
    const summaries = await this.events.summaries(
      rows.map((r) => r.event_id),
      caller,
    );

    const categories: Record<Category, BallotEntryView[]> = {
      science: [],
      culture: [],
      sports: [],
    };
    for (const row of rows) {
      const event = summaries.get(row.event_id);
      if (event === undefined) continue;
      categories[categorySchema.parse(row.category)].push({
        id: event.id,
        event,
        voteCount: counts?.get(row.id) ?? row.final_vote_count ?? null,
      });
    }

    let myVotes: Record<Category, string | null> | undefined;
    if (caller.role === 'student') {
      const mine = await this.db.votes.findMany({
        where: { student_user_id: caller.userId, voting_date: dbDate(date) },
        select: { category: true, daily_ballot_id: true },
      });
      const byBallot = new Map(
        rows.map((row) => [row.id, summaries.get(row.event_id)?.id ?? null]),
      );
      myVotes = { science: null, culture: null, sports: null };
      for (const vote of mine) {
        myVotes[categorySchema.parse(vote.category)] = byBallot.get(vote.daily_ballot_id) ?? null;
      }
    }
    return {
      date: date.toString(),
      opensAt: window.opensAt.toString(),
      closesAt: window.closesAt.toString(),
      categories,
      ...(myVotes === undefined ? {} : { myVotes }),
    };
  }

  /** The admin picks three pool events per category for a future day. */
  async setBallot(
    dateText: string,
    selection: Record<Category, string[]>,
    actor: AuthContext & { requestId: string },
  ): Promise<BallotView> {
    const date = Temporal.PlainDate.from(dateText);
    if (Temporal.PlainDate.compare(date, this.today()) <= 0) {
      throw new ConflictError(
        'Oylama başladıktan sonra seçim değiştirilemez; ertesi gün ya da sonrası seçilmeli.',
      );
    }
    const window = istanbulDayWindow(date);
    const fieldErrors: { field: string; message: string }[] = [];
    const chosen: { category: Category; eventId: bigint }[] = [];
    const all = CATEGORIES.flatMap((category) => selection[category]);
    if (new Set(all).size !== all.length) {
      fieldErrors.push({ field: 'science', message: 'Aynı etkinlik birden fazla kez seçilemez.' });
    }

    for (const category of CATEGORIES) {
      for (const [index, publicId] of selection[category].entries()) {
        const field = `${category}.${index.toString()}`;
        const event = await this.events.findInternal(publicId);
        if (event === null) {
          fieldErrors.push({ field, message: 'Etkinlik bulunamadı.' });
          continue;
        }
        if (event.status !== 'pool')
          fieldErrors.push({
            field,
            message: 'Yalnızca onaylı havuzdaki etkinlikler seçilebilir.',
          });
        if (event.category !== category)
          fieldErrors.push({ field, message: 'Etkinlik bu kategoriye ait değil.' });
        if (
          Temporal.Instant.compare(
            Temporal.Instant.from(isoFromDb(event.starts_at)),
            window.closesAt,
          ) < 0
        ) {
          fieldErrors.push({ field, message: 'Etkinlik, oylama bittikten sonra başlamalı.' });
        }
        const open = await this.db.daily_ballots.findFirst({
          where: {
            event_id: event.id,
            voting_date: { not: dbDate(date), gte: dbDate(this.today()) },
          },
        });
        if (open !== null)
          fieldErrors.push({ field, message: 'Etkinlik başka bir günün oylamasında.' });
        chosen.push({ category, eventId: event.id });
      }
    }
    if (fieldErrors.length > 0)
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', fieldErrors);

    await this.db.$transaction(async (tx) => {
      await tx.daily_ballots.deleteMany({ where: { voting_date: dbDate(date) } });
      for (const entry of chosen) {
        await tx.daily_ballots.create({
          data: {
            voting_date: dbDate(date),
            category: entry.category,
            event_id: entry.eventId,
            selected_by_user_id: actor.userId,
          },
        });
      }
      await tx.audit_log.create({
        data: {
          actor_user_id: actor.userId,
          action: 'ballot.set',
          entity_type: 'ballot',
          details: { date: date.toString() },
          request_id: actor.requestId,
        },
      });
    });
    return await this.ballot(actor, date.toString());
  }

  /** Idempotent: repeating the same vote returns it; another entry in the same category is a conflict. */
  async vote(caller: AuthContext, eventPublicId: string) {
    const today = this.today();
    const event = await this.events.findInternal(eventPublicId);
    const ballot =
      event === null
        ? null
        : await this.db.daily_ballots.findFirst({
            where: { voting_date: dbDate(today), event_id: event.id },
          });
    if (ballot === null) throw new NotFoundError('Bu etkinlik bugünün oylamasında değil.');

    const existing = async () =>
      await this.db.votes.findFirst({
        where: {
          student_user_id: caller.userId,
          voting_date: dbDate(today),
          category: ballot.category,
        },
      });
    // INSERT ... ON CONFLICT DO NOTHING: exactly one concurrent request inserts,
    // the others see count 0 and read the stored vote (no exception path).
    const inserted = await this.db.votes.createMany({
      data: [
        {
          student_user_id: caller.userId,
          daily_ballot_id: ballot.id,
          voting_date: dbDate(today),
          category: ballot.category,
        },
      ],
      skipDuplicates: true,
    });
    const created = inserted.count === 1;
    const row = await existing();
    if (row === null) throw new ConflictError('Oy kaydedilemedi.');
    if (row.daily_ballot_id !== ballot.id) {
      throw new ConflictError('Bu kategoride bugün başka bir etkinliğe oy verdiniz.');
    }
    await this.redis.client.del(`ballot-counts:${today.toString()}`);
    return {
      created,
      vote: {
        date: today.toString(),
        category: categorySchema.parse(ballot.category),
        ballotEntryId: eventPublicId,
        createdAt: isoFromDb(row.created_at),
      },
    };
  }

  async results(caller: AuthContext, dateText?: string): Promise<{ items: VotingResultView[] }> {
    const date =
      dateText === undefined
        ? this.today().subtract({ days: 1 })
        : Temporal.PlainDate.from(dateText);
    const rows = await this.db.voting_results.findMany({ where: { voting_date: dbDate(date) } });
    const ballots = await this.db.daily_ballots.findMany({ where: { voting_date: dbDate(date) } });
    const summaries = await this.events.summaries(
      ballots.map((b) => b.event_id),
      caller,
    );
    const byId = new Map(ballots.map((b) => [b.id, b]));
    return {
      items: rows.map((row) => {
        const category = categorySchema.parse(row.category);
        const winnerBallot =
          row.winning_ballot_id === null ? undefined : byId.get(row.winning_ballot_id);
        const winner =
          winnerBallot === undefined ? undefined : summaries.get(winnerBallot.event_id);
        return {
          id: row.public_id,
          date: date.toString(),
          category,
          status: parseResultStatus(row.status),
          totalVotes: row.total_votes,
          ...(winner === undefined ? {} : { winner }),
          tiedEventIds: row.tied_ballot_ids.flatMap((id) => {
            const ballot = byId.get(id);
            const event = ballot === undefined ? undefined : summaries.get(ballot.event_id);
            return event === undefined ? [] : [event.id];
          }),
          entries: ballots
            .filter((b) => b.category === category)
            .flatMap((b) => {
              const event = summaries.get(b.event_id);
              return event === undefined ? [] : [{ event, voteCount: b.final_vote_count ?? 0 }];
            })
            .sort((a, b) => b.voteCount - a.voteCount),
        };
      }),
    };
  }

  /**
   * For scoring: each voter's choice in the day and category the event won.
   * Null when the event did not win a daily vote (it is then not scored).
   */
  async voteChoicesForEvent(eventId: bigint): Promise<Map<bigint, 'winner' | 'other'> | null> {
    const ballot = await this.db.daily_ballots.findFirst({
      where: { event_id: eventId, voting_results: { some: { status: 'winner' } } },
    });
    if (ballot === null) return null;
    const votes = await this.db.votes.findMany({
      where: { voting_date: ballot.voting_date, category: ballot.category },
      select: { student_user_id: true, daily_ballot_id: true },
    });
    return new Map(
      votes.map((v) => [v.student_user_id, v.daily_ballot_id === ballot.id ? 'winner' : 'other']),
    );
  }

  /** For the score summary: votes cast and the events voted for that won, in a date range. */
  async voteStats(
    studentId: bigint,
    from: PlainDate,
    to: PlainDate,
  ): Promise<{ votedCount: number; wonEventIds: bigint[] }> {
    const votes = await this.db.votes.findMany({
      where: { student_user_id: studentId, voting_date: { gte: dbDate(from), lte: dbDate(to) } },
      select: {
        daily_ballots: {
          select: { event_id: true, voting_results: { where: { status: 'winner' } } },
        },
      },
    });
    return {
      votedCount: votes.length,
      wonEventIds: votes.flatMap((v) =>
        v.daily_ballots.voting_results.length > 0 ? [v.daily_ballots.event_id] : [],
      ),
    };
  }

  /** For the archive page: the results of every day the event was on the ballot. */
  async resultsForEvent(eventId: bigint, caller: AuthContext): Promise<VotingResultView[]> {
    const ballots = await this.db.daily_ballots.findMany({
      where: { event_id: eventId },
      orderBy: { voting_date: 'asc' },
    });
    const views: VotingResultView[] = [];
    for (const ballot of ballots) {
      const { items } = await this.results(caller, plainDate(ballot.voting_date).toString());
      views.push(...items.filter((item) => item.category === ballot.category));
    }
    return views;
  }

  /** Closes every finished voting day that has no result yet (catch-up safe, idempotent). */
  async closeDueDays(): Promise<number> {
    const today = this.today();
    const due = await this.db.daily_ballots.findMany({
      where: { voting_date: { lt: dbDate(today) } },
      distinct: ['voting_date'],
      select: { voting_date: true },
    });
    let closed = 0;
    for (const { voting_date } of due) closed += await this.closeDay(plainDate(voting_date));
    return closed;
  }

  async closeDay(date: PlainDate): Promise<number> {
    const { minimumVotesToWin } = await this.settings.get();
    let closed = 0;
    for (const category of CATEGORIES) {
      await this.db.$transaction(async (tx) => {
        const done = await tx.voting_results.findFirst({
          where: { voting_date: dbDate(date), category },
        });
        const ballots = await tx.daily_ballots.findMany({
          where: { voting_date: dbDate(date), category },
        });
        if (done !== null || ballots.length === 0) return;
        const grouped = await tx.votes.groupBy({
          by: ['daily_ballot_id'],
          where: { daily_ballot_id: { in: ballots.map((b) => b.id) } },
          _count: { _all: true },
        });
        const tally = ballots.map((b) => ({
          id: b.id,
          votes: grouped.find((g) => g.daily_ballot_id === b.id)?._count._all ?? 0,
        }));
        for (const t of tally) {
          await tx.daily_ballots.update({
            where: { id: t.id },
            data: { final_vote_count: t.votes },
          });
        }
        const outcome = decideCategory(tally, minimumVotesToWin);
        const winner =
          outcome.status === 'winner' ? ballots.find((b) => b.id === outcome.winner) : undefined;
        await tx.voting_results.create({
          data: {
            voting_date: dbDate(date),
            category,
            status: outcome.status,
            total_votes: outcome.total,
            winning_ballot_id: winner?.id ?? null,
            tied_ballot_ids: outcome.status === 'tie_pending' ? outcome.tied : [],
          },
        });
        if (winner !== undefined) await this.events.scheduleWinner(winner.event_id, tx);
        closed += 1;
      });
    }
    return closed;
  }

  async decideTie(
    resultPublicId: string,
    eventPublicId: string,
    actor: AuthContext & { requestId: string },
  ): Promise<VotingResultView> {
    const result = await this.db.voting_results.findUnique({
      where: { public_id: resultPublicId },
    });
    if (result === null) throw new NotFoundError('Sonuç bulunamadı.');
    if (result.status !== 'tie_pending')
      throw new ConflictError('Bu sonuçta karar bekleyen eşitlik yok.');
    const event = await this.events.findInternal(eventPublicId);
    const ballot =
      event === null
        ? null
        : await this.db.daily_ballots.findFirst({
            where: { voting_date: result.voting_date, event_id: event.id },
          });
    if (ballot === null || !result.tied_ballot_ids.includes(ballot.id)) {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'eventId', message: 'Yalnızca eşit oy alan etkinliklerden biri seçilebilir.' },
      ]);
    }
    await this.db.$transaction(async (tx) => {
      const updated = await tx.voting_results.updateMany({
        where: { id: result.id, status: 'tie_pending' },
        data: {
          status: 'winner',
          winning_ballot_id: ballot.id,
          tie_decided_by_user_id: actor.userId,
        },
      });
      if (updated.count === 0) throw new ConflictError('Bu sonuçta karar bekleyen eşitlik yok.');
      await this.events.scheduleWinner(ballot.event_id, tx);
      await tx.audit_log.create({
        data: {
          actor_user_id: actor.userId,
          action: 'voting.tie_decided',
          entity_type: 'voting_result',
          entity_id: result.id,
          details: { event: eventPublicId },
          request_id: actor.requestId,
        },
      });
    });
    const { items } = await this.results(actor, plainDate(result.voting_date).toString());
    const view = items.find((item) => item.id === resultPublicId);
    if (view === undefined) throw new NotFoundError('Sonuç bulunamadı.');
    return view;
  }
}

function parseResultStatus(value: string): VotingResultView['status'] {
  if (
    value === 'winner' ||
    value === 'tie_pending' ||
    value === 'below_threshold' ||
    value === 'no_votes'
  ) {
    return value;
  }
  throw new Error(`unknown voting result status ${value}`);
}
