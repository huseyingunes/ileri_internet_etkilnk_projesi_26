import { Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type JobHandler, JobQueue, JobRegistry } from '../../infra/queue.js';
import { EventCompleted } from '../attendance/event-completed.js';
import { EventsService } from '../events/events.service.js';
import { Notifier } from '../notifications/notifier.service.js';
import { SEASON_ROLLOVER_JOB, ScoringService } from './scoring.service.js';

/**
 * Worker side of scoring: scores each completed event (subscriber of
 * `event.completed`) and rolls the season over every night, so the new
 * academic year opens on 1 September with a top-10 snapshot of the old one.
 */
@Injectable()
export class ScoringJobs implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = SEASON_ROLLOVER_JOB;

  constructor(
    private readonly scoring: ScoringService,
    private readonly completed: EventCompleted,
    private readonly events: EventsService,
    private readonly notifier: Notifier,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
    @InjectPinoLogger(ScoringJobs.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.completed.subscribe('scoring', async (eventId) => {
      const written = await this.scoring.scoreEvent(eventId);
      await this.notifyPoints(eventId);
      this.logger.info({ eventId: eventId.toString(), written }, 'Event scored');
    });
  }

  /** One notification per student whose points changed because of this event. */
  async notifyPoints(eventId: bigint): Promise<void> {
    const event = (await this.events.titles([eventId])).get(eventId);
    if (event === undefined) return;
    const totals = await this.scoring.pointsByStudentFor(eventId);
    await this.notifier.notify(
      [...totals.entries()]
        .filter(([, points]) => points !== 0)
        .map(([userId, points]) => {
          const signed = points > 0 ? `+${String(points)}` : String(points);
          return {
            userId,
            type: 'points_changed' as const,
            title: `Puanınız değişti: ${signed}`,
            body: `"${event.title}" etkinliği sonucunda puanınız ${signed} değişti.`,
            link: '/puanim',
            dedupeKey: `points_changed:${event.publicId}`,
          };
        }),
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.schedule('season-rollover-nightly', '10 0 * * *', SEASON_ROLLOVER_JOB);
  }

  async handle(): Promise<void> {
    const season = await this.scoring.currentSeason();
    this.logger.info({ season: season.name }, 'Season checked');
  }
}
