import { Injectable } from '@nestjs/common';
import {
  academicSeasonOf,
  type AttendanceOutcome,
  istanbulDateOf,
  istanbulDayWindow,
  type LedgerRuleCode,
  nowInstant,
  type Page,
  type PageQuery,
  type Participant,
  type PlainDate,
  planEventScoring,
  SCORE_RULE_CODES,
  type ScoreRuleCode,
  STARTING_POINTS,
  Temporal,
  type UserSummary,
} from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { NotFoundError } from '../../common/errors.js';
import { toPage } from '../../common/pagination.js';
import { isoFromDb, toDbDate } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { type EventSummaryView, EventsService } from '../events/events.service.js';
import { AuditService } from '../identity/audit.service.js';
import { UsersService } from '../identity/users.service.js';
import { VotingService } from '../voting/voting.service.js';

export const SEASON_ROLLOVER_JOB = 'season.rollover';
const LEADERBOARD_SIZE = 10;

const dbDate = (date: PlainDate) => toDbDate(Temporal.Instant.from(`${date.toString()}T00:00:00Z`));
const plainDate = (value: Date) => Temporal.PlainDate.from(isoFromDb(value).slice(0, 10));

interface SeasonRow {
  id: bigint;
  name: string;
  starts_on: Date;
  ends_on: Date;
  starting_points: number;
  status: string;
}

export interface SeasonView {
  name: string;
  startsOn: string;
  endsOn: string;
  status: 'active' | 'closed';
}

export interface ScoreSummaryView {
  season: string;
  points: number;
  rank: number | null;
  attendedCount: number;
  votedCount: number;
  attendanceRateAfterVoting: number | null;
}

interface Standing {
  studentId: bigint;
  points: number;
  attendedCount: number;
}

const seasonView = (row: SeasonRow): SeasonView => ({
  name: row.name,
  startsOn: plainDate(row.starts_on).toString(),
  endsOn: plainDate(row.ends_on).toString(),
  status: row.status === 'closed' ? 'closed' : 'active',
});

/** [start of the first day, start of the day after the last day) in Istanbul time. */
const seasonInterval = (row: SeasonRow) => ({
  from: istanbulDayWindow(plainDate(row.starts_on)).opensAt,
  to: istanbulDayWindow(plainDate(row.ends_on)).closesAt,
});

function parseRuleCode(value: string): ScoreRuleCode {
  const code = SCORE_RULE_CODES.find((c) => c === value);
  if (code === undefined) throw new Error(`unknown score rule ${value}`);
  return code;
}

function parseLedgerCode(value: string): LedgerRuleCode {
  return value === 'excuse_reversal' ? value : parseRuleCode(value);
}

/**
 * Points (prompt section 3): an append-only ledger per season; totals are the
 * season's starting points plus the ledger sum. Owns seasons, score_rules,
 * score_ledger and leaderboard_snapshots; other modules' data comes through
 * their services.
 */
@Injectable()
export class ScoringService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
    private readonly events: EventsService,
    private readonly voting: VotingService,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  // --- Seasons -----------------------------------------------------------------

  /**
   * The season of today (Istanbul). Opens it automatically on 1 September and
   * closes the previous one with a top-10 snapshot. Safe to call concurrently.
   */
  async currentSeason(): Promise<SeasonRow> {
    const today = istanbulDateOf(nowInstant());
    const active = await this.db.seasons.findFirst({ where: { status: 'active' } });
    if (active !== null && Temporal.PlainDate.compare(plainDate(active.ends_on), today) >= 0) {
      return active;
    }
    const target = academicSeasonOf(today);
    return await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('season-rollover', 0))`;
      const stale = await tx.seasons.findFirst({ where: { status: 'active' } });
      if (stale !== null) {
        if (Temporal.PlainDate.compare(plainDate(stale.ends_on), today) >= 0) return stale;
        await this.snapshot(stale, tx);
        await tx.seasons.update({
          where: { id: stale.id },
          data: { status: 'closed', closed_at: toDbDate(nowInstant()) },
        });
      }
      const existing = await tx.seasons.findUnique({ where: { name: target.name } });
      if (existing !== null) return existing;
      return await tx.seasons.create({
        data: {
          name: target.name,
          starts_on: dbDate(target.startsOn),
          ends_on: dbDate(target.endsOn),
          starting_points: STARTING_POINTS,
        },
      });
    });
  }

  private async seasonByName(name: string | undefined): Promise<SeasonRow> {
    if (name === undefined) return await this.currentSeason();
    const season = await this.db.seasons.findUnique({ where: { name } });
    if (season === null) throw new NotFoundError('Sezon bulunamadı.');
    return season;
  }

  /** For analytics: a season's name, dates and Istanbul time interval [from, to). */
  async seasonRange(name: string | undefined) {
    const season = await this.seasonByName(name);
    const { from, to } = seasonInterval(season);
    return {
      name: season.name,
      startsOn: plainDate(season.starts_on),
      endsOn: plainDate(season.ends_on),
      from,
      to,
    };
  }

  async listSeasons(): Promise<{ items: SeasonView[] }> {
    await this.currentSeason();
    const rows = await this.db.seasons.findMany({ orderBy: { starts_on: 'desc' } });
    return { items: rows.map(seasonView) };
  }

  // --- Rules -------------------------------------------------------------------

  async currentRules() {
    const rows = await this.db.score_rules.findMany({ where: { valid_to: null } });
    return rows.map((r) => ({
      id: r.id,
      code: parseRuleCode(r.code),
      points: r.points,
      validFrom: isoFromDb(r.valid_from),
    }));
  }

  async listRules() {
    const rules = await this.currentRules();
    return {
      items: SCORE_RULE_CODES.flatMap((code) => {
        const rule = rules.find((r) => r.code === code);
        return rule === undefined ? [] : [{ code, points: rule.points, validFrom: rule.validFrom }];
      }),
    };
  }

  /** New version of a rule; earlier ledger entries keep the version they used. */
  async updateRule(
    code: ScoreRuleCode,
    points: number,
    actor: AuthContext & { requestId: string },
  ) {
    const created = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('score-rules', 0))`;
      const now = toDbDate(nowInstant());
      const current = await tx.score_rules.findFirst({ where: { code, valid_to: null } });
      if (current !== null) {
        await tx.score_rules.update({ where: { id: current.id }, data: { valid_to: now } });
      }
      return await tx.score_rules.create({
        data: { code, points, valid_from: now, created_by_user_id: actor.userId },
      });
    });
    await this.audit.record({
      actorUserId: actor.userId,
      action: 'score_rule.update',
      entityType: 'score_rule',
      entityId: created.id,
      details: { code, points },
      requestId: actor.requestId,
    });
    return { code, points: created.points, validFrom: isoFromDb(created.valid_from) };
  }

  // --- Ledger ------------------------------------------------------------------

  /**
   * Scores a completed event that won a daily vote. Idempotent: the ledger's
   * unique (student, event, rule) constraint ignores repeated runs.
   */
  async scoreEvent(eventId: bigint): Promise<number> {
    const event = await this.events.findInternalById(eventId);
    if (event?.status !== 'completed') return 0;
    const choices = await this.voting.voteChoicesForEvent(eventId);
    if (choices === null) return 0;
    const outcomes = await this.attendance.finalOutcomes(eventId);
    const excused = await this.db.excuses.findMany({
      where: { event_id: eventId, status: 'approved' },
      select: { student_user_id: true },
    });
    const excusedIds = new Set(excused.map((e) => e.student_user_id));
    const students = new Set([...choices.keys(), ...outcomes.keys()]);
    const participants: Participant<bigint>[] = [...students].map((studentId) => {
      const outcome: AttendanceOutcome = outcomes.get(studentId) ?? 'none';
      return {
        studentId,
        vote: choices.get(studentId) ?? 'none',
        attendance: excusedIds.has(studentId) && outcome !== 'attended' ? 'excused' : outcome,
      };
    });
    const rules = await this.currentRules();
    const points = Object.fromEntries(rules.map((r) => [r.code, r.points]));
    const table: Record<ScoreRuleCode, number> = {
      voted_winner_attended: points['voted_winner_attended'] ?? 0,
      voted_winner_absent: points['voted_winner_absent'] ?? 0,
      no_vote_attended: points['no_vote_attended'] ?? 0,
      voted_other_attended: points['voted_other_attended'] ?? 0,
      voted_other_absent: points['voted_other_absent'] ?? 0,
      no_vote_absent: points['no_vote_absent'] ?? 0,
    };
    const season = await this.currentSeason();
    const planned = planEventScoring(participants, table);
    const result = await this.db.score_ledger.createMany({
      data: planned.map((entry) => ({
        season_id: season.id,
        student_user_id: entry.studentId,
        event_id: eventId,
        score_rule_id: rules.find((r) => r.code === entry.ruleCode)?.id ?? null,
        rule_code: entry.ruleCode,
        points: entry.points,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  /** Net points per student written for an event (excluding reversals). */
  async pointsByStudentFor(eventId: bigint): Promise<Map<bigint, number>> {
    const rows = await this.db.score_ledger.groupBy({
      by: ['student_user_id'],
      where: { event_id: eventId, rule_code: { not: 'excuse_reversal' } },
      _sum: { points: true },
    });
    return new Map(rows.map((r) => [r.student_user_id, r._sum.points ?? 0]));
  }

  /** Entries of one student for one event (used when an excuse is approved late). */
  async entriesFor(studentId: bigint, eventId: bigint) {
    const rows = await this.db.score_ledger.findMany({
      where: { student_user_id: studentId, event_id: eventId },
    });
    return rows.map((r) => ({
      seasonId: r.season_id,
      ruleCode: parseLedgerCode(r.rule_code),
      points: r.points,
    }));
  }

  async writeReversal(
    seasonId: bigint,
    studentId: bigint,
    eventId: bigint,
    points: number,
    tx: Prisma.TransactionClient = this.db,
  ): Promise<void> {
    await tx.score_ledger.createMany({
      data: [
        {
          season_id: seasonId,
          student_user_id: studentId,
          event_id: eventId,
          score_rule_id: null,
          rule_code: 'excuse_reversal',
          points,
        },
      ],
      skipDuplicates: true,
    });
  }

  async myEntries(
    caller: AuthContext,
    seasonName: string | undefined,
    query: PageQuery,
  ): Promise<
    Page<{ event: EventSummaryView; ruleCode: LedgerRuleCode; points: number; createdAt: string }>
  > {
    const season = await this.seasonByName(seasonName);
    const rows = await this.db.score_ledger.findMany({
      where: {
        season_id: season.id,
        student_user_id: caller.userId,
        ...(query.cursor === undefined ? {} : { public_id: { lt: query.cursor } }),
      },
      orderBy: { public_id: 'desc' },
      take: query.limit + 1,
    });
    const events = await this.events.summaries(
      rows.map((r) => r.event_id),
      caller,
    );
    const page = toPage(rows, query.limit, (row) => ({ row, event: events.get(row.event_id) }));
    return {
      items: page.items.flatMap(({ row, event }) =>
        event === undefined
          ? []
          : [
              {
                event,
                ruleCode: parseLedgerCode(row.rule_code),
                points: row.points,
                createdAt: isoFromDb(row.created_at),
              },
            ],
      ),
      page: page.page,
    };
  }

  // --- Standings ----------------------------------------------------------------

  /**
   * All active students ordered by points, then attended events, then id
   * (deterministic). Students without ledger entries have the starting points.
   */
  private async standings(season: SeasonRow, tx: Prisma.TransactionClient = this.db) {
    const students = await this.users.activeStudentIds();
    const sums = await tx.score_ledger.groupBy({
      by: ['student_user_id'],
      where: { season_id: season.id },
      _sum: { points: true },
    });
    const { from, to } = seasonInterval(season);
    const attended = await this.attendance.attendedCounts(students, from, to);
    const sumOf = new Map(sums.map((s) => [s.student_user_id, s._sum.points ?? 0]));
    const list: Standing[] = students.map((studentId) => ({
      studentId,
      points: season.starting_points + (sumOf.get(studentId) ?? 0),
      attendedCount: attended.get(studentId) ?? 0,
    }));
    list.sort((a, b) =>
      b.points !== a.points
        ? b.points - a.points
        : b.attendedCount !== a.attendedCount
          ? b.attendedCount - a.attendedCount
          : a.studentId < b.studentId
            ? -1
            : 1,
    );
    return list;
  }

  private async snapshot(season: SeasonRow, tx: Prisma.TransactionClient): Promise<void> {
    const top = (await this.standings(season, tx)).slice(0, LEADERBOARD_SIZE);
    await tx.leaderboard_snapshots.createMany({
      data: top.map((s, index) => ({
        season_id: season.id,
        rank: index + 1,
        student_user_id: s.studentId,
        total_points: s.points,
        attended_count: s.attendedCount,
      })),
      skipDuplicates: true,
    });
  }

  private async summaryOf(
    season: SeasonRow,
    studentId: bigint,
    standings: Standing[] | undefined,
  ): Promise<ScoreSummaryView> {
    const list = standings ?? (await this.standings(season));
    const index = list.findIndex((s) => s.studentId === studentId);
    const own = list[index];
    const stats = await this.voting.voteStats(
      studentId,
      plainDate(season.starts_on),
      plainDate(season.ends_on),
    );
    const statuses = await this.attendance.statusesOf(studentId, stats.wonEventIds);
    const counted = [...statuses.values()].filter((s) => s === 'attended' || s === 'absent');
    return {
      season: season.name,
      points: own?.points ?? season.starting_points,
      rank: own === undefined ? null : index + 1,
      attendedCount: own?.attendedCount ?? 0,
      votedCount: stats.votedCount,
      attendanceRateAfterVoting:
        counted.length === 0
          ? null
          : counted.filter((s) => s === 'attended').length / counted.length,
    };
  }

  async myScore(caller: AuthContext, seasonName: string | undefined) {
    const season = await this.seasonByName(seasonName);
    return await this.summaryOf(season, caller.userId, undefined);
  }

  /** Top 10: live for the active season, from the archive for closed ones. */
  async leaderboard(caller: AuthContext, seasonName: string | undefined) {
    const season = await this.seasonByName(seasonName);
    let top: Standing[];
    let standings: Standing[] | undefined;
    if (season.status === 'closed') {
      const rows = await this.db.leaderboard_snapshots.findMany({
        where: { season_id: season.id },
        orderBy: { rank: 'asc' },
      });
      top = rows.map((r) => ({
        studentId: r.student_user_id,
        points: r.total_points,
        attendedCount: r.attended_count,
      }));
    } else {
      standings = await this.standings(season);
      top = standings.slice(0, LEADERBOARD_SIZE);
    }
    const people = await this.users.summaries(top.map((s) => s.studentId));
    const entries = top.flatMap((s, index) => {
      const student: UserSummary | undefined = people.get(s.studentId);
      return student === undefined
        ? []
        : [{ rank: index + 1, student, points: s.points, attendedCount: s.attendedCount }];
    });
    return {
      season: seasonView(season),
      entries,
      ...(caller.role === 'student'
        ? { me: await this.summaryOf(season, caller.userId, standings) }
        : {}),
    };
  }
}
