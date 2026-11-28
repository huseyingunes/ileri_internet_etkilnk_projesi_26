import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerParams } from '../common/logging.js';
import { ConfigModule } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DatabaseModule } from '../infra/database.js';
import { JobRegistryModule, QueueModule } from '../infra/queue.js';
import { RedisModule } from '../infra/redis.js';
import { StorageModule } from '../infra/storage.js';
import { ApplicationsQueryModule } from '../modules/applications/applications.query.js';
import { AttendanceFinalizer } from '../modules/attendance/attendance.finalizer.js';
import { AttendanceModule } from '../modules/attendance/attendance.module.js';
import { EventCompletedModule } from '../modules/attendance/event-completed.js';
import { IdentityModule } from '../modules/identity/identity.module.js';
import { MediaProcessor } from '../modules/media/media.processor.js';
import { SettingsModule } from '../modules/settings/settings.module.js';
import { VotingCloser } from '../modules/voting/voting.closer.js';
import { VotingModule } from '../modules/voting/voting.module.js';
import { HealthModule } from '../modules/health/health.module.js';
import { JobRunnerService } from './job-runner.service.js';
import { WorkerHealthServer } from './worker-health.server.js';

@Module({})
export class WorkerModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(loggerParams(env, { http: false })),
        DatabaseModule.forRoot(env.WORKER_DB_POOL_SIZE),
        RedisModule,
        StorageModule,
        QueueModule,
        JobRegistryModule,
        HealthModule,
        IdentityModule,
        ApplicationsQueryModule,
        SettingsModule,
        VotingModule,
        AttendanceModule,
        EventCompletedModule,
      ],
      providers: [
        JobRunnerService,
        WorkerHealthServer,
        MediaProcessor,
        VotingCloser,
        AttendanceFinalizer,
      ],
    };
  }
}
