import { Module } from '@nestjs/common';
import { CommunitiesModule } from '../communities/communities.module.js';
import { MediaModule } from '../media/media.module.js';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { TagsController } from './tags.controller.js';

@Module({
  imports: [CommunitiesModule, MediaModule],
  controllers: [EventsController, TagsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
