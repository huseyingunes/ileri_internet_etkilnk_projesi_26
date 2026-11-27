import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Queue, Worker } from 'bullmq';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { createRedisConnection } from '../infra/redis.js';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from './queues.js';

/**
 * Hosts the BullMQ workers. Phase 0 registers no job handlers yet; unknown
 * job names fail loudly instead of being silently dropped.
 */
@Injectable()
export class JobRunnerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker | undefined;
  private deadLetter: Queue | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @InjectPinoLogger(JobRunnerService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.deadLetter = new Queue(QUEUE_NAMES.deadLetter, {
      connection: createRedisConnection(this.env),
    });
    this.worker = new Worker(QUEUE_NAMES.system, async (job) => this.process(job), {
      connection: createRedisConnection(this.env),
      concurrency: this.env.WORKER_CONCURRENCY,
    });
    this.worker.on('failed', (job, error) => {
      void this.handleFailure(job, error);
    });
    this.worker.on('error', (error) => {
      this.logger.error({ err: error }, 'Worker error');
    });
    this.logger.info({ queue: QUEUE_NAMES.system }, 'Worker started');
  }

  private process(job: Job): Promise<void> {
    return Promise.reject(new Error(`No handler registered for job "${job.name}"`));
  }

  private async handleFailure(job: Job | undefined, error: Error): Promise<void> {
    if (job === undefined) {
      return;
    }
    const attempts = job.opts.attempts ?? DEFAULT_JOB_OPTIONS.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }
    this.logger.error(
      { err: error, jobId: job.id, jobName: job.name, requestId: job.data?.requestId },
      'ALERT: job exhausted retries; moved to dead-letter queue',
    );
    await this.deadLetter?.add(job.name, {
      originalQueue: QUEUE_NAMES.system,
      originalJobId: job.id,
      data: job.data,
      failedReason: error.message,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    // close() waits for active jobs to finish before resolving.
    await this.worker?.close();
    await this.deadLetter?.close();
  }
}
