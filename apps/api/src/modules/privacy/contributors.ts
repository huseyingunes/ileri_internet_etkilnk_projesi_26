import { Injectable, type OnModuleInit } from '@nestjs/common';
import { isoFromDb, nowForDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { EventsService } from '../events/events.service.js';
import { SessionStore } from '../identity/session.store.js';
import { PersonalDataRegistry, type PersonalDataContributor } from './personal-data.registry.js';

/*
 * One contributor per owning module, each touching only that module's tables.
 * They are kept together in this one reviewed file because KVKK requests
 * need a complete view of a person's data (documented exception, ADR 0019).
 */

const ERASED_TEXT = '[silindi]';
const iso = (value: Date | null) => (value === null ? null : isoFromDb(value));

async function eventRefs(events: EventsService, ids: readonly bigint[]) {
  const titles = await events.titles(ids);
  return (id: bigint) => {
    const t = titles.get(id);
    return { eventId: t?.publicId ?? null, eventTitle: t?.title ?? null };
  };
}

abstract class Contributor implements PersonalDataContributor, OnModuleInit {
  abstract readonly section: string;
  readonly eraseOrder: number = 10;
  constructor(protected readonly registry: PersonalDataRegistry) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  abstract export(userId: bigint): Promise<unknown>;
  erase(_userId: bigint): Promise<void> {
    return Promise.resolve();
  }
}

/** Identity: profile and consents; erasing anonymizes the user row itself (last). */
@Injectable()
export class IdentityPersonalData extends Contributor {
  readonly section = 'profile';
  override readonly eraseOrder = 100;
  constructor(
    registry: PersonalDataRegistry,
    private readonly db: DatabaseService,
    private readonly sessions: SessionStore,
  ) {
    super(registry);
  }

  async export(userId: bigint) {
    const user = await this.db.users.findUniqueOrThrow({ where: { id: userId } });
    const consents = await this.db.consents.findMany({ where: { user_id: userId } });
    return {
      id: user.public_id,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      studentNumber: user.student_number,
      phone: user.phone,
      createdAt: isoFromDb(user.created_at),
      lastLoginAt: iso(user.last_login_at),
      consents: consents.map((c) => ({
        kind: c.kind,
        textVersion: c.text_version,
        grantedAt: isoFromDb(c.granted_at),
        revokedAt: iso(c.revoked_at),
      })),
    };
  }

  /** Keeps the row (ledger, audit and votes stay consistent) but cuts the link to the person. */
  override async erase(userId: bigint): Promise<void> {
    const user = await this.db.users.findUniqueOrThrow({ where: { id: userId } });
    if (user.anonymized_at !== null) return;
    const now = nowForDb();
    await this.db.$transaction([
      this.db.consents.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: now },
      }),
      this.db.users.update({
        where: { id: userId },
        data: {
          display_name: 'Silinmiş kullanıcı',
          email: `silinmis-${user.public_id}@anonim.invalid`,
          oidc_subject: `deleted:${user.public_id}`,
          student_number: null,
          phone: null,
          is_active: false,
          anonymized_at: now,
        },
      }),
    ]);
    await this.sessions.destroyAllForUser(userId);
  }
}

@Injectable()
export class ApplicationsPersonalData extends Contributor {
  readonly section = 'applications';
  constructor(
    registry: PersonalDataRegistry,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {
    super(registry);
  }
  async export(userId: bigint) {
    const rows = await this.db.applications.findMany({ where: { student_user_id: userId } });
    const ref = await eventRefs(
      this.events,
      rows.map((r) => r.event_id),
    );
    return rows.map((r) => ({
      ...ref(r.event_id),
      status: r.status,
      appliedAt: isoFromDb(r.applied_at),
      confirmedAt: iso(r.confirmed_at),
      cancelledAt: iso(r.cancelled_at),
    }));
  }
}

@Injectable()
export class VotingPersonalData extends Contributor {
  readonly section = 'votes';
  constructor(
    registry: PersonalDataRegistry,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {
    super(registry);
  }
  async export(userId: bigint) {
    const rows = await this.db.votes.findMany({
      where: { student_user_id: userId },
      include: { daily_ballots: { select: { event_id: true } } },
    });
    const ref = await eventRefs(
      this.events,
      rows.map((r) => r.daily_ballots.event_id),
    );
    return rows.map((r) => ({
      date: isoFromDb(r.voting_date).slice(0, 10),
      category: r.category,
      ...ref(r.daily_ballots.event_id),
      votedAt: isoFromDb(r.created_at),
    }));
  }
}

/** Attendance holds no coordinates (never stored); scans keep distance and time only. */
@Injectable()
export class AttendancePersonalData extends Contributor {
  readonly section = 'attendance';
  constructor(
    registry: PersonalDataRegistry,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {
    super(registry);
  }
  async export(userId: bigint) {
    const [finals, scans] = await Promise.all([
      this.db.attendances.findMany({ where: { student_user_id: userId } }),
      this.db.attendance_scans.findMany({ where: { student_user_id: userId } }),
    ]);
    const ref = await eventRefs(this.events, [
      ...finals.map((f) => f.event_id),
      ...scans.map((s) => s.event_id),
    ]);
    return {
      results: finals.map((f) => ({
        ...ref(f.event_id),
        status: f.status,
        presentSeconds: f.present_seconds,
      })),
      scans: scans.map((s) => ({
        ...ref(s.event_id),
        kind: s.kind,
        scannedAt: isoFromDb(s.scanned_at),
        distanceM: s.distance_m === null ? null : Number(s.distance_m),
        accepted: s.accepted,
        rejectionReason: s.rejection_reason,
      })),
    };
  }
}

@Injectable()
export class ScoringPersonalData extends Contributor {
  readonly section = 'points';
  constructor(
    registry: PersonalDataRegistry,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {
    super(registry);
  }
  async export(userId: bigint) {
    const [ledger, excuses] = await Promise.all([
      this.db.score_ledger.findMany({
        where: { student_user_id: userId },
        include: { seasons: { select: { name: true } } },
      }),
      this.db.excuses.findMany({ where: { student_user_id: userId } }),
    ]);
    const ref = await eventRefs(this.events, [
      ...ledger.map((l) => l.event_id),
      ...excuses.map((e) => e.event_id),
    ]);
    return {
      ledger: ledger.map((l) => ({
        season: l.seasons.name,
        ...ref(l.event_id),
        rule: l.rule_code,
        points: l.points,
        createdAt: isoFromDb(l.created_at),
      })),
      excuses: excuses.map((e) => ({
        ...ref(e.event_id),
        reason: e.reason,
        status: e.status,
        createdAt: isoFromDb(e.created_at),
      })),
    };
  }
  /** The ledger is immutable and stays (now anonymous); excuse texts are removed. */
  override async erase(userId: bigint): Promise<void> {
    await this.db.excuses.updateMany({
      where: { student_user_id: userId },
      data: { reason: ERASED_TEXT },
    });
  }
}

@Injectable()
export class FeedbackPersonalData extends Contributor {
  readonly section = 'feedback';
  constructor(
    registry: PersonalDataRegistry,
    private readonly db: DatabaseService,
    private readonly events: EventsService,
  ) {
    super(registry);
  }
  async export(userId: bigint) {
    const [prompts, ratings] = await Promise.all([
      this.db.reason_prompts.findMany({
        where: { student_user_id: userId },
        include: { reason_answers: true },
      }),
      this.db.ratings.findMany({ where: { student_user_id: userId } }),
    ]);
    const ref = await eventRefs(this.events, [
      ...prompts.map((p) => p.event_id),
      ...ratings.map((r) => r.event_id),
    ]);
    return {
      reasonAnswers: prompts.map((p) => ({
        ...ref(p.event_id),
        kind: p.kind,
        answer: p.reason_answers?.answer ?? null,
        answeredAt: iso(p.reason_answers?.answered_at ?? null),
      })),
      ratings: ratings.map((r) => ({
        ...ref(r.event_id),
        score: r.score,
        comment: r.comment,
        createdAt: isoFromDb(r.created_at),
      })),
    };
  }
  /** Scores stay for the event averages; free texts are removed. */
  override async erase(userId: bigint): Promise<void> {
    await this.db.ratings.updateMany({
      where: { student_user_id: userId },
      data: { comment: null },
    });
    await this.db.reason_answers.updateMany({
      where: { reason_prompts: { student_user_id: userId } },
      data: { answer: ERASED_TEXT },
    });
  }
}

@Injectable()
export class NotificationsPersonalData extends Contributor {
  readonly section = 'notifications';
  constructor(
    registry: PersonalDataRegistry,
    private readonly db: DatabaseService,
  ) {
    super(registry);
  }
  async export(userId: bigint) {
    const [notifications, preferences, interests] = await Promise.all([
      this.db.notifications.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
      }),
      this.db.notification_preferences.findMany({ where: { user_id: userId } }),
      this.db.user_interests.findMany({
        where: { user_id: userId },
        include: { tags: { select: { name: true } } },
      }),
    ]);
    return {
      notifications: notifications.map((n) => ({
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: isoFromDb(n.created_at),
        readAt: iso(n.read_at),
      })),
      preferences: preferences.map((p) => ({
        channel: p.channel,
        type: p.type,
        enabled: p.enabled,
      })),
      interests: interests.map((i) => ({ tag: i.tags.name, source: i.source })),
    };
  }
  override async erase(userId: bigint): Promise<void> {
    await this.db.$transaction([
      this.db.notification_deliveries.deleteMany({ where: { notifications: { user_id: userId } } }),
      this.db.notifications.deleteMany({ where: { user_id: userId } }),
      this.db.notification_preferences.deleteMany({ where: { user_id: userId } }),
      this.db.user_interests.deleteMany({ where: { user_id: userId } }),
    ]);
  }
}
