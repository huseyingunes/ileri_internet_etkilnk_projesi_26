import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { DefaultDenyGuard } from './common/auth/default-deny.guard.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { loggerParams } from './common/logging.js';
import { ConfigModule } from './config/config.module.js';
import type { Env } from './config/env.js';
import { DatabaseModule } from './infra/database.js';
import { RedisModule } from './infra/redis.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        LoggerModule.forRoot(loggerParams(env, { http: true })),
        DatabaseModule.forRoot(env.API_DB_POOL_SIZE),
        RedisModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: DefaultDenyGuard },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
      ],
    };
  }
}
