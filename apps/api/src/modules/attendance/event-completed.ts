import { Global, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { type JobHandler, JobRegistry } from '../../infra/queue.js';
import { EVENT_COMPLETED_JOB } from './attendance.service.js';

export type EventCompletedSubscriber = (eventId: bigint) => Promise<void>;

/**
 * Fan-out for the `event.completed` job: scoring, "why" questions and rating
 * requests subscribe here. Every subscriber must be idempotent because the
 * job is retried as a whole.
 */
@Injectable()
export class EventCompleted implements JobHandler, OnModuleInit {
  readonly jobName = EVENT_COMPLETED_JOB;
  private readonly subscribers: { name: string; run: EventCompletedSubscriber }[] = [];

  constructor(private readonly registry: JobRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  subscribe(name: string, run: EventCompletedSubscriber): void {
    this.subscribers.push({ name, run });
  }

  async handle(data: unknown): Promise<void> {
    const { eventId } = z.object({ eventId: z.string().regex(/^[0-9]+$/) }).parse(data);
    for (const subscriber of this.subscribers) {
      await subscriber.run(BigInt(eventId));
    }
  }
}

@Global()
@Module({ providers: [EventCompleted], exports: [EventCompleted] })
export class EventCompletedModule {}
