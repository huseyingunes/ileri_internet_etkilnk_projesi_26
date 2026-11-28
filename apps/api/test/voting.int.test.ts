import { CATEGORIES, type Category, type PlainDate, Temporal } from '@etkinlik/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VotingService } from '../src/modules/voting/voting.service.js';
import { call, startTestApp, type TestApp } from './support/app.js';
import type { TestBrowser } from './support/browser.js';

let t: TestApp;
let voting: VotingService;
let admin: TestBrowser & { userId: bigint };
let today: PlainDate;

beforeAll(async () => {
  t = await startTestApp();
  voting = t.app.get(VotingService);
  admin = await t.loginAs('admin');
  today = voting.today();
}, 300_000);

afterAll(async () => {
  await t.stop();
});

const dbDate = (date: PlainDate) => new Date(`${date.toString()}T00:00:00Z`);

async function poolEvent(
  category: Category,
  daysAhead = 10,
): Promise<{ id: string; internal: bigint }> {
  const starts = today.add({ days: daysAhead }).toString();
  const created = await call(t, admin, 'POST', '/events', {
    title: `${category} etkinliği ${Math.random().toString(36).slice(2, 7)}`,
    description: 'Açıklama',
    category,
    startsAt: `${starts}T10:00:00+03:00`,
    endsAt: `${starts}T12:00:00+03:00`,
    location: { name: 'Kampüs', latitude: 41, longitude: 29 },
    capacity: 30,
    attendanceRadiusM: 100,
    qrRefreshSeconds: 25,
  });
  expect(created.status).toBe(201);
  const id = String(created.body['id']);
  const row = await t.db.prisma.events.findUniqueOrThrow({ where: { public_id: id } });
  return { id, internal: row.id };
}

/** Puts events on a ballot directly (as if the admin had selected them earlier). */
async function seedBallot(date: PlainDate, entries: { category: Category; internal: bigint }[]) {
  const rows = [];
  for (const entry of entries) {
    rows.push(
      await t.db.prisma.daily_ballots.create({
        data: {
          voting_date: dbDate(date),
          category: entry.category,
          event_id: entry.internal,
          selected_by_user_id: admin.userId,
        },
      }),
    );
  }
  return rows;
}

describe('daily selection', () => {
  it('lets the admin pick three pool events per category for tomorrow and hides live counts', async () => {
    const selection: Record<Category, string[]> = { science: [], culture: [], sports: [] };
    for (const category of CATEGORIES) {
      for (let i = 0; i < 3; i += 1) selection[category].push((await poolEvent(category)).id);
    }
    const tomorrow = today.add({ days: 1 }).toString();
    const set = await call(t, admin, 'PUT', `/ballots/${tomorrow}`, selection);
    expect(set.status).toBe(200);

    const student = await t.loginAs('student');
    const ballot = await call(t, student, 'GET', `/ballots?date=${tomorrow}`);
    const categories = ballot.body['categories'] as Record<
      Category,
      { voteCount: number | null }[]
    >;
    for (const category of CATEGORIES) {
      expect(categories[category]).toHaveLength(3);
      for (const entry of categories[category]) expect(entry.voteCount).toBeNull();
    }
    const audit = await call(t, admin, 'GET', '/audit-log?action=ballot.set');
    expect((audit.body['items'] as unknown[]).length).toBe(1);
  });

  it('rejects selections for today, from the wrong category or outside the pool', async () => {
    const science = [
      await poolEvent('science'),
      await poolEvent('science'),
      await poolEvent('science'),
    ];
    const culture = [
      await poolEvent('culture'),
      await poolEvent('culture'),
      await poolEvent('culture'),
    ];
    const sports = [
      await poolEvent('sports'),
      await poolEvent('sports'),
      await poolEvent('sports'),
    ];
    const body = {
      science: science.map((e) => e.id),
      culture: culture.map((e) => e.id),
      sports: sports.map((e) => e.id),
    };
    expect((await call(t, admin, 'PUT', `/ballots/${today.toString()}`, body)).status).toBe(409);

    const swapped = { ...body, science: [culture[0]?.id, science[1]?.id, science[2]?.id] };
    const wrong = await call(
      t,
      admin,
      'PUT',
      `/ballots/${today.add({ days: 2 }).toString()}`,
      swapped,
    );
    expect(wrong.status).toBe(422);
    expect(JSON.stringify(wrong.body['fieldErrors'])).toContain('science.0');

    const student = await t.loginAs('student');
    expect(
      (await call(t, student, 'PUT', `/ballots/${today.add({ days: 3 }).toString()}`, body)).status,
    ).toBe(403);
  });
});

describe('voting', () => {
  it('records one vote per student, day and category, idempotently', async () => {
    const events = [
      await poolEvent('science'),
      await poolEvent('science'),
      await poolEvent('science'),
    ];
    await seedBallot(
      today,
      events.map((e) => ({ category: 'science' as const, internal: e.internal })),
    );
    const student = await t.loginAs('student', 4);
    const [first, second] = events;

    const cast = await call(t, student, 'POST', '/votes', { ballotEntryId: first?.id });
    expect(cast.status).toBe(201);
    expect(cast.body['category']).toBe('science');
    expect((await call(t, student, 'POST', '/votes', { ballotEntryId: first?.id })).status).toBe(
      200,
    );
    expect((await call(t, student, 'POST', '/votes', { ballotEntryId: second?.id })).status).toBe(
      409,
    );

    const ballot = await call(t, student, 'GET', '/ballots');
    expect((ballot.body['myVotes'] as Record<string, string | null>)['science']).toBe(first?.id);

    const advisor = await t.loginAs('advisor');
    expect((await call(t, advisor, 'POST', '/votes', { ballotEntryId: first?.id })).status).toBe(
      403,
    );

    const notOnBallot = await poolEvent('science');
    expect(
      (await call(t, student, 'POST', '/votes', { ballotEntryId: notOnBallot.id })).status,
    ).toBe(404);
  });

  it('stores exactly one vote under concurrent duplicate requests', async () => {
    const event = await poolEvent('sports');
    await seedBallot(today, [{ category: 'sports', internal: event.internal }]);
    const student = await t.loginAs('student', 5);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        call(t, student, 'POST', '/votes', { ballotEntryId: event.id }),
      ),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(9);
    const stored = await t.db.prisma.votes.count({
      where: { student_user_id: student.userId, category: 'sports' },
    });
    expect(stored).toBe(1);
  });
});

describe('closing and ties', () => {
  async function vote(date: PlainDate, ballotId: bigint, category: Category, studentIndex: number) {
    const student = await t.loginAs('student', studentIndex);
    await t.db.prisma.votes.create({
      data: {
        student_user_id: student.userId,
        daily_ballot_id: ballotId,
        voting_date: dbDate(date),
        category,
      },
    });
  }

  it('schedules a clear winner, keeps losers in the pool and leaves ties to the admin', async () => {
    const day = today.subtract({ days: 2 });
    const science = [
      await poolEvent('science'),
      await poolEvent('science'),
      await poolEvent('science'),
    ];
    const culture = [
      await poolEvent('culture'),
      await poolEvent('culture'),
      await poolEvent('culture'),
    ];
    const ballots = await seedBallot(day, [
      ...science.map((e) => ({ category: 'science' as const, internal: e.internal })),
      ...culture.map((e) => ({ category: 'culture' as const, internal: e.internal })),
    ]);
    // Science: 2-1-0 → clear winner. Culture: 1-1-0 → tie.
    await vote(day, ballots[0]?.id ?? 0n, 'science', 10);
    await vote(day, ballots[0]?.id ?? 0n, 'science', 11);
    await vote(day, ballots[1]?.id ?? 0n, 'science', 12);
    await vote(day, ballots[3]?.id ?? 0n, 'culture', 10);
    await vote(day, ballots[4]?.id ?? 0n, 'culture', 11);

    expect(await voting.closeDay(day)).toBe(2);
    expect(await voting.closeDay(day)).toBe(0); // idempotent

    const statuses = await t.db.prisma.events.findMany({
      where: { id: { in: [...science, ...culture].map((e) => e.internal) } },
      select: { public_id: true, status: true },
    });
    const status = (id: string | undefined) => statuses.find((s) => s.public_id === id)?.status;
    expect(status(science[0]?.id)).toBe('scheduled');
    expect(status(science[1]?.id)).toBe('pool');
    expect(status(culture[0]?.id)).toBe('pool');

    const results = await call(t, admin, 'GET', `/voting-results?date=${day.toString()}`);
    const items = results.body['items'] as {
      id: string;
      category: string;
      status: string;
      totalVotes: number;
      tiedEventIds: string[];
    }[];
    expect(items.find((r) => r.category === 'science')).toMatchObject({
      status: 'winner',
      totalVotes: 3,
    });
    const tie = items.find((r) => r.category === 'culture');
    expect(tie?.status).toBe('tie_pending');
    expect(tie?.tiedEventIds.sort()).toEqual([culture[0]?.id, culture[1]?.id].sort());

    // Only a tied event may be chosen, only by an admin, only once.
    const student = await t.loginAs('student');
    expect(
      (
        await call(t, student, 'PUT', `/voting-results/${tie?.id ?? ''}/tie-decision`, {
          eventId: culture[0]?.id,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(t, admin, 'PUT', `/voting-results/${tie?.id ?? ''}/tie-decision`, {
          eventId: culture[2]?.id,
        })
      ).status,
    ).toBe(422);
    const decided = await call(t, admin, 'PUT', `/voting-results/${tie?.id ?? ''}/tie-decision`, {
      eventId: culture[1]?.id,
    });
    expect(decided.body['status']).toBe('winner');
    expect(status(culture[1]?.id)).toBe('pool');
    const after = await t.db.prisma.events.findUniqueOrThrow({
      where: { public_id: culture[1]?.id ?? '' },
    });
    expect(after.status).toBe('scheduled');
    expect(
      (
        await call(t, admin, 'PUT', `/voting-results/${tie?.id ?? ''}/tie-decision`, {
          eventId: culture[0]?.id,
        })
      ).status,
    ).toBe(409);
    const audit = await call(t, admin, 'GET', '/audit-log?action=voting.tie_decided');
    expect((audit.body['items'] as unknown[]).length).toBe(1);
  });

  it('declares no winner below the configurable minimum threshold', async () => {
    const updated = await call(t, admin, 'PATCH', '/settings', { minimumVotesToWin: 5 });
    expect(updated.body['minimumVotesToWin']).toBe(5);
    expect((await call(t, admin, 'PATCH', '/settings', { minimumVotesToWin: 0 })).status).toBe(422);

    const day = today.subtract({ days: 3 });
    const events = [
      await poolEvent('sports'),
      await poolEvent('sports'),
      await poolEvent('sports'),
    ];
    const ballots = await seedBallot(
      day,
      events.map((e) => ({ category: 'sports' as const, internal: e.internal })),
    );
    await vote(day, ballots[0]?.id ?? 0n, 'sports', 13);
    await voting.closeDay(day);
    const result = await t.db.prisma.voting_results.findFirstOrThrow({
      where: { voting_date: dbDate(day), category: 'sports' },
    });
    expect(result.status).toBe('below_threshold');
    const event = await t.db.prisma.events.findUniqueOrThrow({
      where: { id: events[0]?.internal ?? 0n },
    });
    expect(event.status).toBe('pool');
    await call(t, admin, 'PATCH', '/settings', { minimumVotesToWin: 1 });
  });

  it('catches up every finished day without a result', async () => {
    const day = today.subtract({ days: 4 });
    const event = await poolEvent('science');
    await seedBallot(day, [{ category: 'science', internal: event.internal }]);
    expect(await voting.closeDueDays()).toBeGreaterThanOrEqual(1);
    expect(Temporal.PlainDate.compare(day, today)).toBeLessThan(0);
    expect(await voting.closeDueDays()).toBe(0);
  });
});
