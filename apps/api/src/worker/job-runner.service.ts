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
import { JobRegistry } from '../infra/queue.js';
import { createRedisConnection } from '../infra/redis.js';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from './queues.js';

/** Jobs carry the originating request id so logs can be correlated end to end. */
function requestIdOf(data: unknown): string | undefined {
  if (typeof data === 'object' && data !== null && 'requestId' in data) {
    const { requestId } = data;
    return typeof requestId === 'string' ? requestId : undefined;
  }
  return undefined;
}

/**
 * Hosts the BullMQ worker and dispatches jobs to handlers registered in
 * JobRegistry. Unknown job names fail loudly instead of being dropped.
 */
@Injectable()
export class JobRunnerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker<unknown> | undefined;
  private deadLetter: Queue | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly registry: JobRegistry,
    @InjectPinoLogger(JobRunnerService.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.deadLetter = new Queue(QUEUE_NAMES.deadLetter, {
      connection: createRedisConnection(this.env),
    });
    this.worker = new Worker<unknown>(QUEUE_NAMES.system, (job) => this.process(job), {
      connection: createRedisConnection(this.env),
      concurrency: this.env.WORKER_CONCURRENCY,
    });
    this.worker.on('failed', (job, error) => {
      this.handleFailure(job, error).catch((dlqError: unknown) => {
        this.logger.error({ err: dlqError, jobId: job?.id }, 'ALERT: could not dead-letter job');
      });
    });
    this.worker.on('error', (error) => {
      this.logger.error({ err: error }, 'Worker error');
    });
    this.logger.info({ queue: QUEUE_NAMES.system }, 'Worker started');
  }

  private async process(job: Job<unknown>): Promise<void> {
    const handler = this.registry.get(job.name);
    if (handler === undefined) {
      throw new Error(`No handler registered for job "${job.name}"`);
    }
    await handler.handle(job.data);
  }

  private async handleFailure(job: Job<unknown> | undefined, error: Error): Promise<void> {
    if (job === undefined) {
      return;
    }
    const attempts = job.opts.attempts ?? DEFAULT_JOB_OPTIONS.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }
    this.logger.error(
      { err: error, jobId: job.id, jobName: job.name, requestId: requestIdOf(job.data) },
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
