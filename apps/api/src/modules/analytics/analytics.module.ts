import { Injectable, Module, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type JobHandler, JobQueue, JobRegistry } from '../../infra/queue.js';
import { CommunitiesModule } from '../communities/communities.module.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { ANALYTICS_REFRESH_JOB, AnalyticsService } from './analytics.service.js';

@Module({
  imports: [ScoringModule, CommunitiesModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

/** Worker: classifies new answers and refreshes the dashboard views every 15 minutes. */
@Injectable()
export class AnalyticsRefresher implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = ANALYTICS_REFRESH_JOB;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
    @InjectPinoLogger(AnalyticsRefresher.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.schedule('analytics-refresh', '*/15 * * * *', ANALYTICS_REFRESH_JOB);
  }

  async handle(): Promise<void> {
    const result = await this.analytics.refresh();
    this.logger.info(result, 'Analytics refreshed');
  }
}
