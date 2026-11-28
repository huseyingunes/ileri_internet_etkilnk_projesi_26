import { Injectable, Module, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { CATEGORY_LABELS, formatIstanbul, nowInstant } from '@etkinlik/shared';
import { z } from 'zod';
import { isoFromDb } from '../../common/time.js';
import { type JobHandler, JobQueue, JobRegistry } from '../../infra/queue.js';
import { ApplicationsQuery } from '../applications/applications.query.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { EventsModule } from '../events/events.module.js';
import { EventsService } from '../events/events.service.js';
import { FeedbackModule } from '../feedback/feedback.module.js';
import { FeedbackService } from '../feedback/feedback.service.js';
import { VotingModule } from '../voting/voting.module.js';
import { VotingService } from '../voting/voting.service.js';
import { InterestsService } from './interests.service.js';
import { NOTIFICATION_DELIVER_JOB, Notifier, WHATSAPP_WEBHOOK_JOB } from './notifier.service.js';

export const REMINDERS_JOB = 'notification.reminders';
export const INVITATIONS_JOB = 'notification.vote-invitations';
export const VOTE_RESULTS_JOB = 'notification.vote-results';
export const INTERESTS_JOB = 'interests.recompute';

/** Signals older than a year do not shape interests any more. */
const INTEREST_WINDOW_DAYS = 365;

@Injectable()
class DeliverJob implements JobHandler, OnModuleInit {
  readonly jobName = NOTIFICATION_DELIVER_JOB;
  constructor(
    private readonly notifier: Notifier,
    private readonly registry: JobRegistry,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  async handle(data: unknown): Promise<void> {
    const { deliveryId } = z.object({ deliveryId: z.string().regex(/^[0-9]+$/) }).parse(data);
    await this.notifier.deliver(BigInt(deliveryId));
  }
}

@Injectable()
class WebhookJob implements JobHandler, OnModuleInit {
  readonly jobName = WHATSAPP_WEBHOOK_JOB;
  constructor(
    private readonly notifier: Notifier,
    private readonly registry: JobRegistry,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  async handle(): Promise<void> {
    await this.notifier.processWebhooks();
  }
}

/** Hourly: reminds confirmed applicants a day before the event starts (once per event). */
@Injectable()
export class RemindersJob implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = REMINDERS_JOB;
  constructor(
    private readonly events: EventsService,
    private readonly applications: ApplicationsQuery,
    private readonly notifier: Notifier,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.schedule('notification-reminders', '15 * * * *', REMINDERS_JOB);
  }
  async handle(): Promise<void> {
    await this.run();
  }

  async run(): Promise<number> {
    const now = nowInstant();
    const upcoming = await this.events.scheduledStartingBetween(now, now.add({ hours: 24 }));
    let sent = 0;
    for (const event of upcoming) {
      const students = await this.applications.confirmedStudents(event.id);
      sent += await this.notifier.notify(
        students.map((userId) => ({
          userId,
          type: 'event_reminder' as const,
          title: 'Yaklaşan etkinlik',
          body: `"${event.title}" ${formatIstanbul(isoFromDb(event.starts_at))} tarihinde, ${event.location_name} konumunda başlıyor.`,
          link: `/etkinlikler/${event.public_id}`,
          dedupeKey: `event_reminder:${event.public_id}`,
        })),
      );
    }
    return sent;
  }
}

/** Shortly after midnight: invites students whose interests match today's ballot. */
@Injectable()
export class InvitationsJob implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = INVITATIONS_JOB;
  constructor(
    private readonly voting: VotingService,
    private readonly events: EventsService,
    private readonly interests: InterestsService,
    private readonly notifier: Notifier,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  async onApplicationBootstrap(): Promise<void> {
    await this.queue.schedule('notification-vote-invitations', '5 0 * * *', INVITATIONS_JOB);
  }
  async handle(): Promise<void> {
    await this.run();
  }

  async run(): Promise<number> {
    const today = this.voting.today();
    const eventIds = await this.voting.ballotEventIds(today);
    const tagsByEvent = await this.events.tagIdsOfMany(eventIds);
    const titles = await this.events.titles(eventIds);
    const allTags = [...new Set([...tagsByEvent.values()].flat())];
    const interested = await this.interests.studentsInterestedIn(allTags);
    const notifications = [...interested.entries()].map(([userId, tagIds]) => {
      const matching = eventIds
        .filter((id) => (tagsByEvent.get(id) ?? []).some((t) => tagIds.includes(t)))
        .flatMap((id) => {
          const t = titles.get(id);
          return t === undefined ? [] : [`"${t.title}"`];
        });
      return {
        userId,
        type: 'vote_invitation' as const,
        title: 'İlgi alanlarınıza uygun oylama',
        body: `Bugünkü oylamada ilginizi çekebilecek etkinlikler var: ${matching.join(', ')}. Oylama 23.59'da kapanır.`,
        link: '/oylama',
        dedupeKey: `vote_invitation:${today.toString()}`,
      };
    });
    return await this.notifier.notify(notifications);
  }
}

/** After the nightly close: tells voters the result of their category (once per status). */
@Injectable()
export class VoteResultsJob implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = VOTE_RESULTS_JOB;
  constructor(
    private readonly voting: VotingService,
    private readonly notifier: Notifier,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  async onApplicationBootstrap(): Promise<void> {
    // Every 10 minutes: picks up the nightly close and later tie decisions.
    await this.queue.schedule('notification-vote-results', '*/10 * * * *', VOTE_RESULTS_JOB);
  }
  async handle(): Promise<void> {
    await this.run();
  }

  async run(): Promise<number> {
    const announcements = await this.voting.recentAnnouncements(3);
    let sent = 0;
    for (const a of announcements) {
      if (a.status === 'tie_pending') continue; // announced once the admin decides
      const category = CATEGORY_LABELS[a.category];
      const body =
        a.winner === undefined
          ? `${a.date} ${category} oylamasında kazanan çıkmadı.`
          : `${a.date} ${category} oylamasını "${a.winner.title}" kazandı ve takvime eklendi.`;
      sent += await this.notifier.notify(
        a.voterIds.map((userId) => ({
          userId,
          type: 'vote_result' as const,
          title: 'Oylama sonucu',
          body,
          ...(a.winner === undefined ? {} : { link: `/etkinlikler/${a.winner.id}` }),
          dedupeKey: `vote_result:${a.date}:${a.category}`,
        })),
      );
    }
    return sent;
  }
}

/** Nightly: recomputes inferred interests from votes, attendance and good ratings. */
@Injectable()
export class InterestsJob implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = INTERESTS_JOB;
  constructor(
    private readonly voting: VotingService,
    private readonly attendance: AttendanceService,
    private readonly feedback: FeedbackService,
    private readonly interests: InterestsService,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }
  async onApplicationBootstrap(): Promise<void> {
    // Before the 00:05 invitations of the next day would be too tight; 23:30 is quiet.
    await this.queue.schedule('interests-recompute', '30 23 * * *', INTERESTS_JOB);
  }
  async handle(): Promise<void> {
    await this.run();
  }

  async run(): Promise<number> {
    const sinceInstant = nowInstant().subtract({ hours: 24 * INTEREST_WINDOW_DAYS });
    const sinceDate = this.voting.today().subtract({ days: INTEREST_WINDOW_DAYS });
    const signals = [
      ...(await this.voting.votedEventsSince(sinceDate)),
      ...(await this.attendance.attendedSince(sinceInstant)),
      ...(await this.feedback.goodRatingsSince(sinceInstant)),
    ];
    return await this.interests.recomputeInferred(signals);
  }
}

/** Worker-only wiring of the notification jobs. */
@Module({
  imports: [EventsModule, VotingModule, AttendanceModule, FeedbackModule],
  providers: [DeliverJob, WebhookJob, RemindersJob, InvitationsJob, VoteResultsJob, InterestsJob],
  exports: [RemindersJob, InvitationsJob, VoteResultsJob, InterestsJob],
})
export class NotificationJobsModule {}
