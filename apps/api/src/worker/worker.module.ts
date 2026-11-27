import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { loggerParams } from '../common/logging.js';
import { ConfigModule } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DatabaseModule } from '../infra/database.js';
import { RedisModule } from '../infra/redis.js';
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
        HealthModule,
      ],
      providers: [JobRunnerService, WorkerHealthServer],
    };
  }
}
