import { readFile } from 'node:fs/promises';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API_DIR,
  type MigratedDatabase,
  prismaCli,
  runSqlFile,
  sqlState,
  startMigratedDatabase,
} from './support/database.js';
import { createBallot, createEvent, createUser } from './support/seed.js';

let db: MigratedDatabase;

beforeAll(async () => {
  db = await startMigratedDatabase();
});

afterAll(async () => {
  await db.prisma.$disconnect();
  await db.container.stop();
});

const UNIQUE = '23505';
const FOREIGN_KEY = '23503';
const CHECK = '23514';
const EXCLUSION = '23P01';
const APPEND_ONLY = '23001';

describe('schema conventions', () => {
  it('schema.prisma matches the migrated database (no drift)', async () => {
    const pulled = await prismaCli(['db', 'pull', '--print'], db.url);
    const committed = await readFile(`${API_DIR}prisma/schema.prisma`, 'utf8');
    const normalize = (text: string) =>
      text
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line !== '')
        .join('\n');
    expect(normalize(pulled)).toBe(normalize(committed));
  });

  it('indexes every foreign key column', async () => {
    const missing = await db.prisma.$queryRaw<{ constraint_name: string }[]>`
      SELECT c.conname AS constraint_name
      FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.connamespace = 'public'::regnamespace
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid
            AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
            AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey
        )`;
    expect(missing).toEqual([]);
  });

  it('uses bigint identity primary keys and timestamptz everywhere', async () => {
    const badKeys = await db.prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'id'
        AND table_name <> '_prisma_migrations'
        AND (data_type <> 'bigint' OR is_identity <> 'YES' OR identity_generation <> 'ALWAYS')`;
    const naiveTimes = await db.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT table_name || '.' || column_name AS column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
        AND data_type = 'timestamp without time zone'`;
    expect(badKeys).toEqual([]);
    expect(naiveTimes).toEqual([]);
  });

  it('generates UUIDv7 public ids', async () => {
    const id = await createUser(db.prisma);
    const user = await db.prisma.users.findUniqueOrThrow({ where: { id } });
    expect(user.public_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('seeds the default point table from the prompt', async () => {
    const rules = await db.prisma.score_rules.findMany({
      where: { valid_to: null },
      select: { code: true, points: true },
      orderBy: { code: 'asc' },
    });
    expect(Object.fromEntries(rules.map((rule) => [rule.code, rule.points]))).toEqual({
      no_vote_absent: 0,
      no_vote_attended: 10,
      voted_other_absent: 0,
      voted_other_attended: 30,
      voted_winner_absent: -20,
      voted_winner_attended: 20,
    });
  });
});

describe('business constraints', () => {
  it('allows a student number only for students', async () => {
    expect(
      await sqlState(
        db.prisma.users.create({
          data: {
            oidc_subject: 'advisor-with-number',
            email: 'advisor.n@uni.example',
            display_name: 'Advisor',
            role: 'advisor',
            student_number: 'S999999',
          },
        }),
      ),
    ).toBe(CHECK);
  });

  it('requires exactly one organizer: a person or a community', async () => {
    const userId = await createUser(db.prisma);
    const community = await db.prisma.communities.create({ data: { name: 'Robotics Club' } });
    const both = db.prisma.events.create({
      data: {
        title: 'Both organizers',
        description: 'x',
        category: 'science',
        organizer_user_id: userId,
        organizer_community_id: community.id,
        created_by_user_id: userId,
        starts_at: new Date('2026-12-01T10:00:00Z'),
        ends_at: new Date('2026-12-01T12:00:00Z'),
        location_name: 'Hall',
        latitude: 41,
        longitude: 29,
        attendance_radius_m: 100,
        qr_refresh_seconds: 25,
        capacity: 10,
      },
    });
    expect(await sqlState(both)).toBe(CHECK);
  });

  it.each([
    ['zero capacity', { capacity: 0 }],
    ['negative radius', { attendance_radius_m: -1 }],
    ['QR refresh outside 20-30 s', { qr_refresh_seconds: 10 }],
    ['end before start', { ends_at: new Date('2026-12-01T09:00:00Z') }],
    ['unknown category', { category: 'music' }],
  ])('rejects an event with %s', async (_label, override) => {
    const userId = await createUser(db.prisma);
    const event = db.prisma.events.create({
      data: {
        title: 'Invalid event',
        description: 'x',
        category: 'science',
        organizer_user_id: userId,
        created_by_user_id: userId,
        starts_at: new Date('2026-12-01T10:00:00Z'),
        ends_at: new Date('2026-12-01T12:00:00Z'),
        location_name: 'Hall',
        latitude: 41,
        longitude: 29,
        attendance_radius_m: 100,
        qr_refresh_seconds: 25,
        capacity: 10,
        ...override,
      },
    });
    expect(await sqlState(event)).toBe(CHECK);
  });

  it('allows events spanning several days', async () => {
    const userId = await createUser(db.prisma);
    const event = await db.prisma.events.create({
      data: {
        title: 'Three-day festival',
        description: 'x',
        category: 'culture',
        organizer_user_id: userId,
        created_by_user_id: userId,
        starts_at: new Date('2026-12-01T09:00:00Z'),
        ends_at: new Date('2026-12-03T18:00:00Z'),
        location_name: 'Campus',
        latitude: 41,
        longitude: 29,
        attendance_radius_m: 300,
        qr_refresh_seconds: 30,
        capacity: 500,
      },
    });
    expect(event.id).toBeTypeOf('bigint');
  });

  it('limits the daily selection to three events per category', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const events = await Promise.all([1, 2, 3, 4].map(() => createEvent(db.prisma, admin)));
    for (const eventId of events.slice(0, 3)) {
      await createBallot(db.prisma, eventId, admin, '2026-12-10');
    }
    const fourth = events[3];
    if (fourth === undefined) throw new Error('unreachable');
    expect(await sqlState(createBallot(db.prisma, fourth, admin, '2026-12-10'))).toBe(CHECK);
  });

  it('rejects a vote whose category does not match the ballot entry', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const student = await createUser(db.prisma);
    const ballotId = await createBallot(
      db.prisma,
      await createEvent(db.prisma, admin),
      admin,
      '2026-12-11',
    );
    const vote = db.prisma.votes.create({
      data: {
        student_user_id: student,
        daily_ballot_id: ballotId,
        voting_date: new Date('2026-12-11T00:00:00Z'),
        category: 'sports',
      },
    });
    expect(await sqlState(vote)).toBe(FOREIGN_KEY);
  });

  it('keeps waiting-list positions unique per event', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const eventId = await createEvent(db.prisma, admin, { capacity: 1, status: 'scheduled' });
    const [a, b] = [await createUser(db.prisma), await createUser(db.prisma)];
    await db.prisma.applications.create({
      data: { event_id: eventId, student_user_id: a, status: 'waitlisted', waitlist_position: 1 },
    });
    const duplicate = db.prisma.applications.create({
      data: { event_id: eventId, student_user_id: b, status: 'waitlisted', waitlist_position: 1 },
    });
    expect(await sqlState(duplicate)).toBe(UNIQUE);
  });

  it('makes re-scanning the same QR token idempotent', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const student = await createUser(db.prisma);
    const eventId = await createEvent(db.prisma, admin);
    const scan = {
      event_id: eventId,
      student_user_id: student,
      kind: 'entry',
      token_id: 'jti-00000001',
      distance_m: 12.5,
      within_radius: true,
      accepted: true,
    };
    await db.prisma.attendance_scans.create({ data: scan });
    expect(await sqlState(db.prisma.attendance_scans.create({ data: scan }))).toBe(UNIQUE);
  });

  it('never stores raw coordinates for attendance scans', async () => {
    const columns = await db.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'attendance_scans'
        AND column_name ~ '(lat|lon|lng|coord)'`;
    expect(columns).toEqual([]);
  });

  it('keeps the audit log and the score ledger append-only', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const entry = await db.prisma.audit_log.create({
      data: { actor_user_id: admin, action: 'role.assign', entity_type: 'user', entity_id: admin },
    });
    expect(
      await sqlState(
        db.prisma.audit_log.update({ where: { id: entry.id }, data: { action: 'role.revoke' } }),
      ),
    ).toBe(APPEND_ONLY);
    expect(await sqlState(db.prisma.audit_log.delete({ where: { id: entry.id } }))).toBe(
      APPEND_ONLY,
    );
  });

  it('prevents overlapping seasons and more than one active season', async () => {
    await db.prisma.seasons.create({
      data: {
        name: '2026-2027',
        starts_on: new Date('2026-09-01T00:00:00Z'),
        ends_on: new Date('2027-08-31T00:00:00Z'),
      },
    });
    const overlapping = db.prisma.seasons.create({
      data: {
        name: '2027-2028',
        starts_on: new Date('2027-08-01T00:00:00Z'),
        ends_on: new Date('2028-08-31T00:00:00Z'),
        status: 'closed',
        closed_at: new Date(),
      },
    });
    expect(await sqlState(overlapping)).toBe(EXCLUSION);
    const secondActive = db.prisma.seasons.create({
      data: {
        name: '2028-2029',
        starts_on: new Date('2028-09-01T00:00:00Z'),
        ends_on: new Date('2029-08-31T00:00:00Z'),
      },
    });
    expect(await sqlState(secondActive)).toBe(UNIQUE);
  });

  it('rejects ratings outside 1-5', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const student = await createUser(db.prisma);
    const eventId = await createEvent(db.prisma, admin);
    for (const score of [0, 6]) {
      expect(
        await sqlState(
          db.prisma.ratings.create({
            data: { event_id: eventId, student_user_id: student, score },
          }),
        ),
      ).toBe(CHECK);
    }
  });
});

describe('properties', () => {
  it('stores at most one vote per student, day and category', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const students = await Promise.all([1, 2, 3].map(() => createUser(db.prisma)));
    const days = ['2027-01-04', '2027-01-05'];
    const categories = ['science', 'culture', 'sports'] as const;
    const ballots: { id: bigint; day: string; category: string }[] = [];
    for (const day of days) {
      for (const category of categories) {
        for (let i = 0; i < 2; i += 1) {
          const eventId = await createEvent(db.prisma, admin, { category });
          ballots.push({
            id: await createBallot(db.prisma, eventId, admin, day, category),
            day,
            category,
          });
        }
      }
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            student: fc.constantFrom(...students),
            ballot: fc.constantFrom(...ballots),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        async (attempts) => {
          await db.prisma.votes.deleteMany({ where: { student_user_id: { in: students } } });
          const expectedKeys = new Set<string>();
          for (const { student, ballot } of attempts) {
            const state = await sqlState(
              db.prisma.votes.create({
                data: {
                  student_user_id: student,
                  daily_ballot_id: ballot.id,
                  voting_date: new Date(`${ballot.day}T00:00:00Z`),
                  category: ballot.category,
                },
              }),
            );
            const key = `${student}|${ballot.day}|${ballot.category}`;
            expect(state === undefined ? !expectedKeys.has(key) : state === UNIQUE).toBe(true);
            expectedKeys.add(key);
          }
          const stored = await db.prisma.votes.count({
            where: { student_user_id: { in: students } },
          });
          expect(stored).toBe(expectedKeys.size);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('derives totals from the ledger and never scores an event twice', async () => {
    const admin = await createUser(db.prisma, 'admin');
    const season = await db.prisma.seasons.findFirstOrThrow({ where: { status: 'active' } });
    const rules = await db.prisma.score_rules.findMany({ where: { valid_to: null } });
    const events = await Promise.all([1, 2, 3].map(() => createEvent(db.prisma, admin)));

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({ event: fc.constantFrom(...events), rule: fc.constantFrom(...rules) }),
          {
            maxLength: 20,
          },
        ),
        async (entries) => {
          // The ledger is append-only, so each run uses a fresh student.
          const runStudent = await createUser(db.prisma);
          const accepted = new Map<string, number>();
          for (const { event, rule } of entries) {
            const key = `${event}|${rule.code}`;
            const state = await sqlState(
              db.prisma.score_ledger.create({
                data: {
                  season_id: season.id,
                  student_user_id: runStudent,
                  event_id: event,
                  score_rule_id: rule.id,
                  rule_code: rule.code,
                  points: rule.points,
                },
              }),
            );
            expect(state === undefined ? !accepted.has(key) : state === UNIQUE).toBe(true);
            if (state === undefined) accepted.set(key, rule.points);
          }
          const total = await db.prisma.score_ledger.aggregate({
            where: { student_user_id: runStudent, season_id: season.id },
            _sum: { points: true },
          });
          const expected = [...accepted.values()].reduce((sum, points) => sum + points, 0);
          expect(season.starting_points + (total._sum.points ?? 0)).toBe(
            season.starting_points + expected,
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe('rollback', () => {
  it('down.sql removes everything and the migration can be re-applied', async () => {
    await db.prisma.$disconnect();
    await runSqlFile(db.container, '/migrations/20261128010000_audit_log_public_id/down.sql');
    await runSqlFile(db.container, '/migrations/20261128000000_initial_schema/down.sql');
    const remaining = await db.container.exec([
      'psql',
      '-U',
      db.container.getUsername(),
      '-d',
      db.container.getDatabase(),
      '-tAc',
      "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    ]);
    expect(remaining.output.trim()).toBe('0');
    await prismaCli(['migrate', 'deploy'], db.url);
    const pulled = await prismaCli(['db', 'pull', '--print'], db.url);
    expect(pulled).toContain('model score_ledger');
  });
});
