import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { VotingController } from './voting.controller.js';
import { VotingService } from './voting.service.js';

@Module({
  imports: [EventsModule],
  controllers: [VotingController],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
