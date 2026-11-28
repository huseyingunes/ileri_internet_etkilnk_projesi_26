import { Injectable, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { type JobHandler, JobQueue, JobRegistry } from '../../infra/queue.js';
import {
  ATTENDANCE_FINALIZE_JOB,
  AttendanceService,
  EVENT_COMPLETED_JOB,
} from './attendance.service.js';

/**
 * Worker job (every 5 minutes): finalizes attendance of finished events and
 * announces each completed event (scoring, reason questions and rating
 * requests subscribe to `event.completed`). Idempotent.
 */
@Injectable()
export class AttendanceFinalizer implements JobHandler, OnModuleInit, OnApplicationBootstrap {
  readonly jobName = ATTENDANCE_FINALIZE_JOB;

  constructor(
    private readonly attendance: AttendanceService,
    private readonly registry: JobRegistry,
    private readonly queue: JobQueue,
    @InjectPinoLogger(AttendanceFinalizer.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.schedule('attendance-finalize', '*/5 * * * *', ATTENDANCE_FINALIZE_JOB);
  }

  async handle(): Promise<void> {
    const finalized = await this.attendance.finalizeDueEvents();
    for (const eventId of finalized) {
      // jobId de-duplicates: each event is announced once.
      await this.queue.enqueue(
        EVENT_COMPLETED_JOB,
        { eventId: eventId.toString() },
        { jobId: `event-completed-${eventId.toString()}` },
      );
    }
    if (finalized.length > 0) this.logger.info({ count: finalized.length }, 'Attendance finalized');
  }
}
