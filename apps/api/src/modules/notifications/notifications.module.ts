import { Global, Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { InterestsService } from './interests.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { Notifier } from './notifier.service.js';

/** Global so any module can notify; depends only on identity, events and infrastructure. */
@Global()
@Module({
  imports: [EventsModule],
  controllers: [NotificationsController],
  providers: [Notifier, NotificationsService, InterestsService],
  exports: [Notifier, InterestsService],
})
export class NotificationsModule {}
