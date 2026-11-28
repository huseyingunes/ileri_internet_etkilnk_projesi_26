import { Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type JobHandler, JobQueue, JobRegistry } from '../../infra/queue.js';
import { VOTING_CLOSE_JOB, VotingService } from './voting.service.js';

/**
 * Worker job: shortly after midnight (Istanbul) closes the previous voting day
 * and any missed days. Idempotent, so retries and catch-up runs are safe.
 */
@Injectable()
export class VotingCloser implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = VOTING_CLOSE_JOB;

  constructor(
    private readonly voting: VotingService,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
    @InjectPinoLogger(VotingCloser.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.schedule('voting-close-nightly', '30 0 * * *', VOTING_CLOSE_JOB);
    // Catch up right after a restart (e.g. the worker was down at midnight).
    await this.queue.enqueue(
      VOTING_CLOSE_JOB,
      {},
      { jobId: `voting-close-startup-${this.voting.today().toString()}` },
    );
  }

  async handle(): Promise<void> {
    const closed = await this.voting.closeDueDays();
    if (closed > 0) this.logger.info({ closed }, 'Voting categories closed');
  }
}
