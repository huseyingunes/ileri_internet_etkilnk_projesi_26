import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';

@Module({
  imports: [EventsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
