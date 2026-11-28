import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EventCompleted } from '../attendance/event-completed.js';
import { FeedbackService } from './feedback.service.js';

/** Worker: sends the "why" questions when a winning event completes. */
@Injectable()
export class FeedbackJobs implements OnModuleInit {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly completed: EventCompleted,
    @InjectPinoLogger(FeedbackJobs.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.completed.subscribe('reason-prompts', async (eventId) => {
      const created = await this.feedback.createPrompts(eventId);
      this.logger.info({ eventId: eventId.toString(), created }, 'Reason prompts created');
    });
  }
}
