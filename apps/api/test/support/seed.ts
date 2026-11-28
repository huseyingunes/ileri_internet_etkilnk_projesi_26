import type { PrismaClient } from '../../src/generated/prisma/client.js';

let counter = 0;
const next = () => (counter += 1);

export async function createUser(
  prisma: PrismaClient,
  role: 'student' | 'advisor' | 'admin' = 'student',
): Promise<bigint> {
  const n = next();
  const user = await prisma.users.create({
    data: {
      oidc_subject: `subject-${n}`,
      email: `user${n}@uni.example`,
      display_name: `User ${n}`,
      role,
      student_number: role === 'student' ? `S${String(n).padStart(6, '0')}` : null,
    },
    select: { id: true },
  });
  return user.id;
}

export async function createEvent(
  prisma: PrismaClient,
  organizerUserId: bigint,
  overrides: Partial<{ category: string; capacity: number; status: string }> = {},
): Promise<bigint> {
  const event = await prisma.events.create({
    data: {
      title: `Event ${next()}`,
      description: 'Description',
      category: overrides.category ?? 'science',
      status: overrides.status ?? 'pool',
      organizer_user_id: organizerUserId,
      created_by_user_id: organizerUserId,
      starts_at: new Date('2026-12-01T10:00:00Z'),
      ends_at: new Date('2026-12-01T12:00:00Z'),
      location_name: 'Main hall',
      latitude: 41.0,
      longitude: 29.0,
      attendance_radius_m: 100,
      qr_refresh_seconds: 25,
      capacity: overrides.capacity ?? 50,
    },
    select: { id: true },
  });
  return event.id;
}

export async function createBallot(
  prisma: PrismaClient,
  eventId: bigint,
  adminId: bigint,
  votingDate: string,
  category = 'science',
): Promise<bigint> {
  const ballot = await prisma.daily_ballots.create({
    data: {
      voting_date: new Date(`${votingDate}T00:00:00Z`),
      category,
      event_id: eventId,
      selected_by_user_id: adminId,
    },
    select: { id: true },
  });
  return ballot.id;
}
