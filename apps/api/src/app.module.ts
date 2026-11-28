import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { loggerParams } from './common/logging.js';
import { RateLimitGuard } from './common/rate-limit/rate-limit.js';
import { ConfigModule } from './config/config.module.js';
import type { Env } from './config/env.js';
import { DatabaseModule } from './infra/database.js';
import { QueueModule } from './infra/queue.js';
import { RedisModule } from './infra/redis.js';
import { StorageModule } from './infra/storage.js';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { ApplicationsQueryModule } from './modules/applications/applications.query.js';
import { CommunitiesModule } from './modules/communities/communities.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthGuard } from './modules/identity/auth.guard.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { SecurityReportsModule } from './modules/security-reports/security-reports.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { VotingModule } from './modules/voting/voting.module.js';

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
        StorageModule,
        QueueModule,
        ApplicationsQueryModule,
        HealthModule,
        IdentityModule,
        CommunitiesModule,
        ProfileModule,
        SecurityReportsModule,
        MediaModule,
        EventsModule,
        SettingsModule,
        VotingModule,
        ApplicationsModule,
      ],
      providers: [
        // Order matters: authentication/authorization first, then per-user rate limits.
        { provide: APP_GUARD, useExisting: AuthGuard },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
      ],
    };
  }
}
