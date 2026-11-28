import { Inject, Injectable } from '@nestjs/common';
import {
  distanceMeters,
  hasAttended,
  type Instant,
  MAX_LOCATION_ACCURACY_M,
  nowInstant,
  type Page,
  type PageQuery,
  presenceSeconds,
  requiredPresenceSeconds,
  SCAN_GRACE_MINUTES,
  scheduledWindows,
  Temporal,
  type UserSummary,
} from '@etkinlik/shared';
import type { AuthContext } from '../../common/auth/auth-context.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors.js';
import { fromDbDate, isoFromDb, nowForDb, toDbDate } from '../../common/time.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../infra/database.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationsQuery } from '../applications/applications.query.js';
import { EventsService } from '../events/events.service.js';
import { ConsentsService } from '../identity/consents.service.js';
import { UsersService } from '../identity/users.service.js';
import { issueQrToken, type ScanKind, verifyQrToken } from './qr-token.js';

export const ATTENDANCE_FINALIZE_JOB = 'attendance.finalize';
export const EVENT_COMPLETED_JOB = 'event.completed';

type RejectionReason =
  | 'token_expired'
  | 'token_wrong_event'
  | 'outside_radius'
  | 'location_unavailable'
  | 'outside_event_time';

export interface ScanResultView {
  accepted: boolean;
  kind: ScanKind;
  scannedAt: string;
  distanceM?: number;
  rejectionReason?: RejectionReason;
  presenceSoFarSeconds: number;
  requiredPresenceSeconds: number;
}

const nowSeconds = () => Math.floor(nowInstant().epochMilliseconds / 1000);

interface EventRow {
  id: bigint;
  public_id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  latitude: number;
  longitude: number;
  attendance_radius_m: number;
  qr_refresh_seconds: number;
  advisor_user_id: bigint | null;
}

const windowsOf = (event: EventRow) =>
  scheduledWindows(fromDbDate(event.starts_at), fromDbDate(event.ends_at));

/** Within [start − grace, end + grace]. */
function withinEventTime(event: EventRow, at = nowInstant()): boolean {
  const from = fromDbDate(event.starts_at).subtract({ minutes: SCAN_GRACE_MINUTES });
  const to = fromDbDate(event.ends_at).add({ minutes: SCAN_GRACE_MINUTES });
  return Temporal.Instant.compare(at, from) >= 0 && Temporal.Instant.compare(at, to) <= 0;
}

/**
 * Attendance: rotating signed QR codes, location within the event radius and
 * presence for at least half of the event (prompt section 10). Raw
 * coordinates are only used to compute the distance and are never stored.
 */
@Injectable()
export class AttendanceService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
    private readonly applications: ApplicationsQuery,
    private readonly consents: ConsentsService,
    private readonly users: UsersService,
  ) {}

  private async requireEvent(publicId: string): Promise<EventRow> {
    const event = await this.events.findInternal(publicId);
    if (event === null) throw new NotFoundError('Etkinlik bulunamadı.');
    return event;
  }

  /** The QR currently shown on screen by the event's advisor or an admin. */
  async qrToken(caller: AuthContext, eventPublicId: string, kind: ScanKind) {
    const event = await this.requireEvent(eventPublicId);
    if (caller.role !== 'admin' && event.advisor_user_id !== caller.userId) {
      throw new ForbiddenError('Bu etkinliğin QR kodunu gösterme yetkiniz yok.');
    }
    if (event.status !== 'scheduled' || !withinEventTime(event)) {
      throw new ConflictError('QR kodu yalnızca takvimdeki etkinlik süresince gösterilebilir.');
    }
    // Valid for two refresh periods so a code scanned just before it changes still works.
    const { token, claims } = issueQrToken(this.env.QR_SIGNING_SECRET, {
      eventId: event.public_id,
      kind,
      nowSeconds: nowSeconds(),
      lifetimeSeconds: event.qr_refresh_seconds * 2,
    });
    return {
      // The token travels in the URL fragment, which browsers never send to servers (no logs).
      url: `${this.env.APP_ORIGIN}/katilim#t=${token}`,
      expiresAt: Temporal.Instant.fromEpochMilliseconds(claims.expiresAtSeconds * 1000).toString(),
      refreshAfterSeconds: event.qr_refresh_seconds,
      kind,
    };
  }

  private async presence(event: EventRow, studentId: bigint) {
    const scans = await this.db.attendance_scans.findMany({
      where: { event_id: event.id, student_user_id: studentId, accepted: true },
      select: { scanned_at: true },
    });
    const windows = windowsOf(event);
    const instants = scans.map((s) => fromDbDate(s.scanned_at));
    return {
      present: presenceSeconds(windows, instants),
      required: requiredPresenceSeconds(windows),
      attended: hasAttended(windows, instants),
      first: instants.reduce<Instant | undefined>(
        (a, b) => (a === undefined || Temporal.Instant.compare(b, a) < 0 ? b : a),
        undefined,
      ),
      last: instants.reduce<Instant | undefined>(
        (a, b) => (a === undefined || Temporal.Instant.compare(b, a) > 0 ? b : a),
        undefined,
      ),
    };
  }

  /** Verifies token, session, location and time. Idempotent per (student, token). */
  async scan(
    caller: AuthContext,
    input: { token: string; latitude: number; longitude: number; accuracyM: number },
  ): Promise<ScanResultView> {
    const verification = verifyQrToken(this.env.QR_SIGNING_SECRET, input.token, {
      nowSeconds: nowSeconds(),
    });
    if (!('claims' in verification)) {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'token', message: 'QR kodu geçersiz. Lütfen ekrandaki güncel kodu okutun.' },
      ]);
    }
    const claims = verification.claims;
    const event = await this.requireEvent(claims.eventId);

    const previous = await this.db.attendance_scans.findUnique({
      where: {
        student_user_id_token_id: { student_user_id: caller.userId, token_id: claims.tokenId },
      },
    });
    if (previous === null) {
      if (!(await this.consents.isGranted(caller.userId, 'location'))) {
        throw new ForbiddenError('Katılımı doğrulamak için konum iznini vermelisiniz.');
      }
      const confirmed = await this.applications.confirmedStudents(event.id);
      if (!confirmed.includes(caller.userId)) {
        throw new ConflictError('Bu etkinliğe onaylı başvurunuz yok.');
      }
    }

    let row = previous;
    if (row === null) {
      const distance = distanceMeters(
        { latitude: input.latitude, longitude: input.longitude },
        { latitude: event.latitude, longitude: event.longitude },
      );
      const withinRadius = distance <= event.attendance_radius_m;
      let reason: RejectionReason | null = null;
      if (!verification.ok) reason = verification.reason;
      else if (event.status !== 'scheduled' || !withinEventTime(event))
        reason = 'outside_event_time';
      else if (input.accuracyM > MAX_LOCATION_ACCURACY_M) reason = 'location_unavailable';
      else if (!withinRadius) reason = 'outside_radius';

      await this.db.attendance_scans.createMany({
        data: [
          {
            event_id: event.id,
            student_user_id: caller.userId,
            kind: claims.kind,
            token_id: claims.tokenId,
            scanned_at: nowForDb(),
            distance_m: Math.round(distance * 10) / 10,
            within_radius: withinRadius,
            accepted: reason === null,
            rejection_reason: reason,
          },
        ],
        skipDuplicates: true,
      });
      row = await this.db.attendance_scans.findUniqueOrThrow({
        where: {
          student_user_id_token_id: { student_user_id: caller.userId, token_id: claims.tokenId },
        },
      });
    }

    const presence = await this.presence(event, caller.userId);
    const kind = row.kind === 'exit' || row.kind === 'spot_check' ? row.kind : 'entry';
    const rejection = row.rejection_reason;
    return {
      accepted: row.accepted,
      kind,
      scannedAt: isoFromDb(row.scanned_at),
      ...(row.distance_m === null ? {} : { distanceM: Number(row.distance_m) }),
      ...(rejection === null ? {} : { rejectionReason: parseReason(rejection) }),
      presenceSoFarSeconds: Math.floor(presence.present),
      requiredPresenceSeconds: Math.ceil(presence.required),
    };
  }

  /** Advisor/admin view: final attendance after the event, live presence during it. */
  async list(
    caller: AuthContext,
    eventPublicId: string,
    query: PageQuery,
  ): Promise<
    Page<{
      student: UserSummary;
      status: string;
      presentSeconds: number;
      firstValidScanAt?: string;
      lastValidScanAt?: string;
    }>
  > {
    const event = await this.requireEvent(eventPublicId);
    if (caller.role !== 'admin' && event.advisor_user_id !== caller.userId) {
      throw new ForbiddenError('Bu etkinliğin katılımını görme yetkiniz yok.');
    }
    const students = await this.applications.confirmedStudents(event.id);
    const finals = await this.db.attendances.findMany({ where: { event_id: event.id } });
    const ids = [...new Set([...students, ...finals.map((f) => f.student_user_id)])];
    const people = await this.users.summaries(ids);
    const items = [];
    for (const id of ids) {
      const student = people.get(id);
      if (student === undefined) continue;
      const final = finals.find((f) => f.student_user_id === id);
      if (final !== undefined) {
        items.push({
          student,
          status: final.status,
          presentSeconds: final.present_seconds,
          ...(final.first_valid_scan_at === null
            ? {}
            : { firstValidScanAt: isoFromDb(final.first_valid_scan_at) }),
          ...(final.last_valid_scan_at === null
            ? {}
            : { lastValidScanAt: isoFromDb(final.last_valid_scan_at) }),
        });
      } else {
        const presence = await this.presence(event, id);
        items.push({
          student,
          status: 'in_progress',
          presentSeconds: Math.floor(presence.present),
        });
      }
    }
    items.sort((a, b) => a.student.displayName.localeCompare(b.student.displayName, 'tr'));
    const start =
      query.cursor === undefined ? 0 : items.findIndex((i) => i.student.id === query.cursor) + 1;
    const pageItems = items.slice(start, start + query.limit);
    const last = pageItems.at(-1);
    return {
      items: pageItems,
      page: {
        nextCursor:
          start + query.limit < items.length && last !== undefined ? last.student.id : null,
      },
    };
  }

  /** For scoring: final attendance status per student of a completed event. */
  async finalOutcomes(eventId: bigint): Promise<Map<bigint, AttendanceStatus>> {
    const rows = await this.db.attendances.findMany({
      where: { event_id: eventId },
      select: { student_user_id: true, status: true },
    });
    return new Map(rows.map((r) => [r.student_user_id, parseStatus(r.status)]));
  }

  /** For inferred interests: (student, attended event) pairs finalized since an instant. */
  async attendedSince(since: Instant): Promise<{ userId: bigint; eventId: bigint }[]> {
    const rows = await this.db.attendances.findMany({
      where: { status: 'attended', finalized_at: { gte: toDbDate(since) } },
      select: { student_user_id: true, event_id: true },
    });
    return rows.map((r) => ({ userId: r.student_user_id, eventId: r.event_id }));
  }

  async attendedCountOf(eventId: bigint): Promise<number> {
    return await this.db.attendances.count({ where: { event_id: eventId, status: 'attended' } });
  }

  /** An approved excuse turns a recorded absence into an excused one. */
  async markExcused(eventId: bigint, studentId: bigint): Promise<void> {
    await this.db.attendances.updateMany({
      where: { event_id: eventId, student_user_id: studentId, status: 'absent' },
      data: { status: 'excused' },
    });
  }

  /** Attended events per student among finalizations in [from, to). */
  async attendedCounts(
    studentIds: readonly bigint[],
    from: Instant,
    to: Instant,
  ): Promise<Map<bigint, number>> {
    if (studentIds.length === 0) return new Map();
    const grouped = await this.db.attendances.groupBy({
      by: ['student_user_id'],
      where: {
        student_user_id: { in: [...studentIds] },
        status: 'attended',
        finalized_at: { gte: toDbDate(from), lt: toDbDate(to) },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.student_user_id, g._count._all]));
  }

  /** Statuses of one student for the given events (events without a record are omitted). */
  async statusesOf(studentId: bigint, eventIds: readonly bigint[]) {
    if (eventIds.length === 0) return new Map<bigint, AttendanceStatus>();
    const rows = await this.db.attendances.findMany({
      where: { student_user_id: studentId, event_id: { in: [...eventIds] } },
      select: { event_id: true, status: true },
    });
    return new Map(rows.map((r) => [r.event_id, parseStatus(r.status)]));
  }

  /**
   * Finalizes events that ended (plus the scan grace): writes one attendance
   * row per confirmed applicant and per waiting-list student, then marks the
   * event completed. Idempotent; returns the ids of finalized events.
   */
  async finalizeDueEvents(): Promise<bigint[]> {
    const cutoff = nowInstant().subtract({ minutes: SCAN_GRACE_MINUTES });
    const due = await this.db.events.findMany({
      where: { status: 'scheduled', ends_at: { lt: toDbDate(cutoff) } },
    });
    const finalized: bigint[] = [];
    for (const event of due) {
      const confirmed = await this.applications.confirmedStudents(event.id);
      const waitlisted = await this.applications.waitlistedStudents(event.id);
      const rows: Prisma.attendancesCreateManyInput[] = [];
      for (const studentId of confirmed) {
        const p = await this.presence(event, studentId);
        rows.push({
          event_id: event.id,
          student_user_id: studentId,
          status: p.attended ? 'attended' : 'absent',
          present_seconds: Math.floor(p.present),
          first_valid_scan_at: p.first === undefined ? null : toDbDate(p.first),
          last_valid_scan_at: p.last === undefined ? null : toDbDate(p.last),
        });
      }
      for (const studentId of waitlisted) {
        rows.push({
          event_id: event.id,
          student_user_id: studentId,
          status: 'blocked_by_capacity',
          present_seconds: 0,
          first_valid_scan_at: null,
          last_valid_scan_at: null,
        });
      }
      const changed = await this.db.$transaction(async (tx) => {
        const updated = await tx.events.updateMany({
          where: { id: event.id, status: 'scheduled' },
          data: { status: 'completed' },
        });
        if (updated.count === 0) return false;
        await tx.attendances.createMany({ data: rows, skipDuplicates: true });
        return true;
      });
      if (changed) finalized.push(event.id);
    }
    return finalized;
  }
}

export type AttendanceStatus = 'attended' | 'absent' | 'excused' | 'blocked_by_capacity';

function parseStatus(value: string): AttendanceStatus {
  if (
    value === 'attended' ||
    value === 'absent' ||
    value === 'excused' ||
    value === 'blocked_by_capacity'
  ) {
    return value;
  }
  throw new Error(`unknown attendance status ${value}`);
}

function parseReason(value: string): RejectionReason {
  if (
    value === 'token_expired' ||
    value === 'token_wrong_event' ||
    value === 'outside_radius' ||
    value === 'location_unavailable' ||
    value === 'outside_event_time'
  ) {
    return value;
  }
  throw new Error(`unknown rejection reason ${value}`);
}
