import { Global, Injectable, Module } from '@nestjs/common';
import { isoFromDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';

export interface ApplicationView {
  id: string;
  eventId: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  waitlistPosition?: number;
  appliedAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
}

interface ApplicationRow {
  public_id: string;
  status: string;
  waitlist_position: number | null;
  applied_at: Date;
  confirmed_at: Date | null;
  cancelled_at: Date | null;
}

function parseStatus(value: string): ApplicationView['status'] {
  if (value === 'confirmed' || value === 'waitlisted' || value === 'cancelled') return value;
  throw new Error(`unknown application status ${value}`);
}

/** Waiting-list position shown to students: 1-based rank among those still waiting. */
export function toApplicationView(
  row: ApplicationRow,
  eventPublicId: string,
  rank?: number,
): ApplicationView {
  const status = parseStatus(row.status);
  return {
    id: row.public_id,
    eventId: eventPublicId,
    status,
    ...(status === 'waitlisted' ? { waitlistPosition: rank ?? row.waitlist_position ?? 1 } : {}),
    appliedAt: isoFromDb(row.applied_at),
    ...(row.confirmed_at === null ? {} : { confirmedAt: isoFromDb(row.confirmed_at) }),
    ...(row.cancelled_at === null ? {} : { cancelledAt: isoFromDb(row.cancelled_at) }),
  };
}

/**
 * Read-only view of applications for other modules (event pages show counts
 * and the viewer's own application). Has no dependency on the events module,
 * so events can use it without a cycle.
 */
@Injectable()
export class ApplicationsQuery {
  constructor(private readonly db: DatabaseService) {}

  async counts(
    eventIds: readonly bigint[],
  ): Promise<Map<bigint, { confirmed: number; waitlisted: number }>> {
    const result = new Map(eventIds.map((id) => [id, { confirmed: 0, waitlisted: 0 }]));
    if (eventIds.length === 0) return result;
    const grouped = await this.db.applications.groupBy({
      by: ['event_id', 'status'],
      where: {
        event_id: { in: [...new Set(eventIds)] },
        status: { in: ['confirmed', 'waitlisted'] },
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      const entry = result.get(row.event_id) ?? { confirmed: 0, waitlisted: 0 };
      if (row.status === 'confirmed') entry.confirmed = row._count._all;
      if (row.status === 'waitlisted') entry.waitlisted = row._count._all;
      result.set(row.event_id, entry);
    }
    return result;
  }

  async rankOnWaitlist(eventId: bigint, position: number): Promise<number> {
    return (
      (await this.db.applications.count({
        where: { event_id: eventId, status: 'waitlisted', waitlist_position: { lt: position } },
      })) + 1
    );
  }

  async forStudent(
    eventId: bigint,
    eventPublicId: string,
    studentId: bigint,
  ): Promise<ApplicationView | undefined> {
    const row = await this.db.applications.findUnique({
      where: { student_user_id_event_id: { student_user_id: studentId, event_id: eventId } },
    });
    if (row === null) return undefined;
    const rank =
      row.status === 'waitlisted' && row.waitlist_position !== null
        ? await this.rankOnWaitlist(eventId, row.waitlist_position)
        : undefined;
    return toApplicationView(row, eventPublicId, rank);
  }

  /** Confirmed participants of an event (attendance and scoring use this). */
  async confirmedStudents(eventId: bigint): Promise<bigint[]> {
    const rows = await this.db.applications.findMany({
      where: { event_id: eventId, status: 'confirmed' },
      select: { student_user_id: true },
    });
    return rows.map((row) => row.student_user_id);
  }

  /** Students who wanted to attend but never got a seat (they must not lose points). */
  async waitlistedStudents(eventId: bigint): Promise<bigint[]> {
    const rows = await this.db.applications.findMany({
      where: { event_id: eventId, status: 'waitlisted' },
      select: { student_user_id: true },
    });
    return rows.map((row) => row.student_user_id);
  }
}

@Global()
@Module({ providers: [ApplicationsQuery], exports: [ApplicationsQuery] })
export class ApplicationsQueryModule {}
