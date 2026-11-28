import { Injectable, type OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EventCompleted } from '../attendance/event-completed.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { EventsService } from '../events/events.service.js';
import { Notifier } from '../notifications/notifier.service.js';
import { FeedbackService } from './feedback.service.js';

/**
 * Worker: when a winning event completes, sends the "why" questions and asks
 * verified attendees to rate the event. Notifications are de-duplicated, so
 * a retried job is harmless.
 */
@Injectable()
export class FeedbackJobs implements OnModuleInit {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly attendance: AttendanceService,
    private readonly events: EventsService,
    private readonly notifier: Notifier,
    private readonly completed: EventCompleted,
    @InjectPinoLogger(FeedbackJobs.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.completed.subscribe('feedback', async (eventId) => {
      await this.run(eventId);
    });
  }

  async run(eventId: bigint): Promise<void> {
    const created = await this.feedback.createPrompts(eventId);
    const event = (await this.events.titles([eventId])).get(eventId);
    if (event === undefined) return;
    const asked = await this.feedback.promptRecipients(eventId);
    const outcomes = await this.attendance.finalOutcomes(eventId);
    const attended = [...outcomes.entries()]
      .filter(([, status]) => status === 'attended')
      .map(([id]) => id);
    await this.notifier.notify([
      ...asked.map((userId) => ({
        userId,
        type: 'reason_request' as const,
        title: 'Kısa bir sorumuz var',
        body: `"${event.title}" etkinliği hakkında tek bir soruyu yanıtlar mısınız?`,
        link: '/sorularim',
        dedupeKey: `reason_request:${event.publicId}`,
      })),
      ...attended.map((userId) => ({
        userId,
        type: 'rating_request' as const,
        title: 'Etkinliği değerlendirin',
        body: `"${event.title}" etkinliğine 1–5 arası puan verip yorum yazabilirsiniz.`,
        link: `/etkinlikler/${event.publicId}`,
        dedupeKey: `rating_request:${event.publicId}`,
      })),
    ]);
    this.logger.info({ eventId: eventId.toString(), created }, 'Feedback requested');
  }
}
