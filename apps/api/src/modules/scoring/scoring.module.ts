import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { EventsModule } from '../events/events.module.js';
import { VotingModule } from '../voting/voting.module.js';
import { ExcusesService } from './excuses.service.js';
import { ScoringController } from './scoring.controller.js';
import { ScoringService } from './scoring.service.js';

@Module({
  imports: [EventsModule, VotingModule, AttendanceModule],
  controllers: [ScoringController],
  providers: [ScoringService, ExcusesService],
  exports: [ScoringService],
})
export class ScoringModule {}
