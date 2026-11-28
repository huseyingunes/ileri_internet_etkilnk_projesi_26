import { call, type TestApp } from './app.js';
import type { TestBrowser } from './browser.js';

type Actor = TestBrowser & { userId: bigint };

let dayOffset = 1;

/** A distinct past date in the current academic season (UTC midnight, as Prisma expects). */
export function votingDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - dayOffset);
  dayOffset += 1;
  return d;
}

/** An event in the given status that ended two hours ago, advised by `advisor`. */
export async function newEvent(
  t: TestApp,
  admin: Actor,
  advisor: Actor,
  status: string,
): Promise<{ id: bigint; publicId: string }> {
  const created = await call(t, admin, 'POST', '/events', {
    title: `Senaryo ${Math.random().toString(36).slice(2, 7)}`,
    description: 'x',
    category: 'science',
    startsAt: '2030-01-01T10:00:00+03:00',
    endsAt: '2030-01-01T12:00:00+03:00',
    location: { name: 'Amfi', latitude: 41, longitude: 29 },
    capacity: 50,
    attendanceRadiusM: 100,
    qrRefreshSeconds: 25,
  });
  const publicId = String(created.body['id']);
  const row = await t.db.prisma.events.update({
    where: { public_id: publicId },
    data: {
      status,
      starts_at: new Date(Date.now() - 4 * 3_600_000),
      ends_at: new Date(Date.now() - 2 * 3_600_000),
      advisor_user_id: advisor.userId,
    },
  });
  return { id: row.id, publicId };
}

/**
 * A completed event that won its day's science vote against another pool
 * event, with the given votes and final attendance.
 */
export async function wonEvent(
  t: TestApp,
  admin: Actor,
  advisor: Actor,
  votes: { student: bigint; forWinner: boolean }[],
  attendance: { student: bigint; status: string }[],
) {
  const date = votingDate();
  const winner = await newEvent(t, admin, advisor, 'completed');
  const other = await newEvent(t, admin, advisor, 'pool');
  const ballot = (eventId: bigint) =>
    t.db.prisma.daily_ballots.create({
      data: {
        voting_date: date,
        category: 'science',
        event_id: eventId,
        selected_by_user_id: admin.userId,
      },
    });
  const winBallot = await ballot(winner.id);
  const otherBallot = await ballot(other.id);
  await t.db.prisma.votes.createMany({
    data: votes.map((v) => ({
      student_user_id: v.student,
      daily_ballot_id: v.forWinner ? winBallot.id : otherBallot.id,
      voting_date: date,
      category: 'science',
    })),
  });
  await t.db.prisma.daily_ballots.update({
    where: { id: winBallot.id },
    data: { final_vote_count: votes.filter((v) => v.forWinner).length },
  });
  await t.db.prisma.voting_results.create({
    data: {
      voting_date: date,
      category: 'science',
      status: 'winner',
      winning_ballot_id: winBallot.id,
      total_votes: votes.length,
    },
  });
  for (const a of attendance) {
    const waiting = a.status === 'blocked_by_capacity';
    await t.db.prisma.applications.create({
      data: {
        event_id: winner.id,
        student_user_id: a.student,
        status: waiting ? 'waitlisted' : 'confirmed',
        confirmed_at: waiting ? null : new Date(),
        waitlist_position: waiting ? 1 : null,
      },
    });
    const attended = a.status === 'attended';
    await t.db.prisma.attendances.create({
      data: {
        event_id: winner.id,
        student_user_id: a.student,
        status: a.status,
        present_seconds: attended ? 7200 : 0,
        first_valid_scan_at: attended ? new Date(Date.now() - 4 * 3_600_000) : null,
        last_valid_scan_at: attended ? new Date(Date.now() - 2 * 3_600_000) : null,
      },
    });
  }
  return winner;
}
