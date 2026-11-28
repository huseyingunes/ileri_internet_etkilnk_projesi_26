import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { type JobsOptions, Queue } from 'bullmq';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from '../worker/queues.js';
import { createRedisConnection } from './redis.js';

/** Producer side of the background job queue (API and worker both enqueue). */
@Injectable()
export class JobQueue implements OnModuleDestroy {
  private readonly queue: Queue;

  constructor(@Inject(ENV) env: Env) {
    this.queue = new Queue(QUEUE_NAMES.system, {
      connection: createRedisConnection(env),
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
  }

  /**
   * Enqueues an idempotent job. `jobId` de-duplicates: the same id is accepted
   * once while the job exists, so retries of the producing request are safe.
   */
  async enqueue(
    name: string,
    data: Record<string, unknown>,
    options: JobsOptions = {},
  ): Promise<void> {
    await this.queue.add(name, data, options);
  }

  /** Cron-like schedules owned by the worker (BullMQ job schedulers are idempotent upserts). */
  async schedule(schedulerId: string, pattern: string, name: string): Promise<void> {
    await this.queue.upsertJobScheduler(
      schedulerId,
      { pattern, tz: 'Europe/Istanbul' },
      { name, data: {}, opts: DEFAULT_JOB_OPTIONS },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

@Global()
@Module({ providers: [JobQueue], exports: [JobQueue] })
export class QueueModule {}

/** A worker job handler; registered by name in JobRegistry. */
export interface JobHandler {
  readonly jobName: string;
  handle(data: unknown): Promise<void>;
}

@Injectable()
export class JobRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(handler: JobHandler): void {
    if (this.handlers.has(handler.jobName)) {
      throw new Error(`Duplicate job handler for ${handler.jobName}`);
    }
    this.handlers.set(handler.jobName, handler);
  }

  get(name: string): JobHandler | undefined {
    return this.handlers.get(name);
  }
}

@Global()
@Module({ providers: [JobRegistry], exports: [JobRegistry] })
export class JobRegistryModule {}
