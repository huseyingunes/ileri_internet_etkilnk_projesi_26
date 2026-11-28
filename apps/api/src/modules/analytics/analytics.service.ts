import { Injectable } from '@nestjs/common';
import {
  type Category,
  CATEGORIES,
  categorySchema,
  classifyReason,
  REASON_LABELS,
  Temporal,
  type CommunitySummary,
} from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { toDbDate } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CommunitiesService } from '../communities/communities.service.js';
import { UsersService } from '../identity/users.service.js';
import { ScoringService } from '../scoring/scoring.service.js';

export const ANALYTICS_REFRESH_JOB = 'analytics.refresh';

const round2 = (value: number) => Math.round(value * 100) / 100;

const labelOf = (value: string): string =>
  Object.entries(REASON_LABELS).find(([key]) => key === value)?.[1] ?? 'Henüz sınıflandırılmadı';

export interface AnalyticsOverview {
  season: string;
  registeredStudents: number;
  completedEvents: number;
  voterAttendanceRate: number | null;
  averageRating: number | null;
  byCategory: { category: Category; votes: number; attendees: number }[];
  nonAttendanceReasons: { label: string; count: number }[];
  communities: {
    community: CommunitySummary;
    completedEvents: number;
    wins: number;
    averageRating: number | null;
  }[];
  attendanceByHour: { hour: number; attendees: number }[];
}

/**
 * Admin dashboard (prompt section 2, item 13). Reads only the materialized
 * views of the reporting layer with aggregate SQL; advisors see the events
 * they advise, admins everything.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly scoring: ScoringService,
    private readonly users: UsersService,
    private readonly communities: CommunitiesService,
  ) {}

  async overview(
    caller: AuthContext,
    seasonName: string | undefined,
    category: Category | undefined,
  ): Promise<AnalyticsOverview> {
    const season = await this.scoring.seasonRange(seasonName);
    const from = toDbDate(season.from);
    const to = toDbDate(season.to);
    const startsOn = toDbDate(Temporal.Instant.from(`${season.startsOn.toString()}T00:00:00Z`));
    const endsOn = toDbDate(Temporal.Instant.from(`${season.endsOn.toString()}T00:00:00Z`));
    const scope =
      caller.role === 'admin' ? Prisma.sql`TRUE` : Prisma.sql`advisor_user_id = ${caller.userId}`;
    const byCat = category === undefined ? Prisma.sql`TRUE` : Prisma.sql`category = ${category}`;
    const inSeason = Prisma.sql`ends_at >= ${from} AND ends_at < ${to}`;

    const [events] = await this.db.$queryRaw<
      { completed: number; rating_sum: number; rating_count: number }[]
    >`
      SELECT count(*)::int AS completed,
             COALESCE(sum(rating_sum), 0)::int AS rating_sum,
             COALESCE(sum(rating_count), 0)::int AS rating_count
      FROM analytics_event_facts WHERE ${scope} AND ${byCat} AND ${inSeason}`;

    const [voters] = await this.db.$queryRaw<{ attended: number; counted: number }[]>`
      SELECT count(*) FILTER (WHERE attendance = 'attended')::int AS attended,
             count(*) FILTER (WHERE attendance IN ('attended', 'absent'))::int AS counted
      FROM analytics_winner_voters WHERE ${scope} AND ${byCat} AND ${inSeason}`;

    const votes = await this.db.$queryRaw<{ category: string; votes: number }[]>`
      SELECT category, COALESCE(sum(votes), 0)::int AS votes
      FROM analytics_ballot_votes
      WHERE ${scope} AND ${byCat} AND voting_date >= ${startsOn} AND voting_date <= ${endsOn}
      GROUP BY category`;
    const attendees = await this.db.$queryRaw<{ category: string; attendees: number }[]>`
      SELECT category, COALESCE(sum(attendees), 0)::int AS attendees
      FROM analytics_event_facts WHERE ${scope} AND ${byCat} AND ${inSeason}
      GROUP BY category`;

    const reasons = await this.db.$queryRaw<{ label: string; count: number }[]>`
      SELECT label, COALESCE(sum(answers), 0)::int AS count
      FROM analytics_non_attendance_reasons WHERE ${scope} AND ${byCat} AND ${inSeason}
      GROUP BY label ORDER BY count DESC, label`;

    const communityRows = await this.db.$queryRaw<
      {
        community_id: bigint;
        completed: number;
        wins: number;
        rating_sum: number;
        rating_count: number;
      }[]
    >`
      SELECT community_id, count(*)::int AS completed, count(*) FILTER (WHERE won)::int AS wins,
             COALESCE(sum(rating_sum), 0)::int AS rating_sum,
             COALESCE(sum(rating_count), 0)::int AS rating_count
      FROM analytics_event_facts
      WHERE community_id IS NOT NULL AND ${scope} AND ${byCat} AND ${inSeason}
      GROUP BY community_id ORDER BY wins DESC, completed DESC`;
    const communityNames = await this.communities.summaries(
      communityRows.map((r) => r.community_id),
    );

    const hours = await this.db.$queryRaw<{ hour: number; attendees: number }[]>`
      SELECT start_hour AS hour, COALESCE(sum(attendees), 0)::int AS attendees
      FROM analytics_event_facts WHERE ${scope} AND ${byCat} AND ${inSeason}
      GROUP BY start_hour ORDER BY start_hour`;

    const ratingCount = events?.rating_count ?? 0;
    const categories = category === undefined ? CATEGORIES : [category];
    return {
      season: season.name,
      registeredStudents: (await this.users.activeStudentIds()).length,
      completedEvents: events?.completed ?? 0,
      voterAttendanceRate:
        voters === undefined || voters.counted === 0
          ? null
          : round2(voters.attended / voters.counted),
      averageRating: ratingCount === 0 ? null : round2((events?.rating_sum ?? 0) / ratingCount),
      byCategory: categories.map((c) => ({
        category: c,
        votes: votes.find((v) => categorySchema.parse(v.category) === c)?.votes ?? 0,
        attendees: attendees.find((a) => categorySchema.parse(a.category) === c)?.attendees ?? 0,
      })),
      nonAttendanceReasons: reasons.map((r) => ({ label: labelOf(r.label), count: r.count })),
      communities: communityRows.flatMap((r) => {
        const community = communityNames.get(r.community_id);
        return community === undefined
          ? []
          : [
              {
                community,
                completedEvents: r.completed,
                wins: r.wins,
                averageRating: r.rating_count === 0 ? null : round2(r.rating_sum / r.rating_count),
              },
            ];
      }),
      attendanceByHour: hours.map((h) => ({ hour: h.hour, attendees: h.attendees })),
    };
  }

  /** Worker: labels new "why not" answers, then refreshes the views without blocking readers. */
  async refresh(): Promise<{ classified: number }> {
    const pending = await this.db.reason_answers.findMany({
      where: { classification: null, reason_prompts: { kind: 'why_not_attended' } },
      select: { id: true, answer: true },
      take: 1000,
    });
    for (const row of pending) {
      await this.db.reason_answers.updateMany({
        where: { id: row.id, classification: null },
        data: {
          classification: classifyReason(row.answer),
          classified_at: toDbDate(Temporal.Now.instant()),
        },
      });
    }
    // CONCURRENTLY keeps the dashboard readable during the refresh (unique indexes exist).
    await this.db.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_event_facts`;
    await this.db.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_ballot_votes`;
    await this.db.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_winner_voters`;
    await this.db
      .$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_non_attendance_reasons`;
    return { classified: pending.length };
  }
}
