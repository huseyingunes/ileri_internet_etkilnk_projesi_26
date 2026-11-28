import { Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type JobHandler, JobQueue, JobRegistry } from '../../infra/queue.js';
import { EventCompleted } from '../attendance/event-completed.js';
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
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
    @InjectPinoLogger(ScoringJobs.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
    this.completed.subscribe('scoring', async (eventId) => {
      const written = await this.scoring.scoreEvent(eventId);
      this.logger.info({ eventId: eventId.toString(), written }, 'Event scored');
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.schedule('season-rollover-nightly', '10 0 * * *', SEASON_ROLLOVER_JOB);
  }

  async handle(): Promise<void> {
    const season = await this.scoring.currentSeason();
    this.logger.info({ season: season.name }, 'Season checked');
  }
}
