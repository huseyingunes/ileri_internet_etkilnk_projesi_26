import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** Creates a Redis connection suitable for both commands and BullMQ. */
export function createRedisConnection(env: Env): Redis {
  return new Redis(env.REDIS_URL, {
    // Required by BullMQ workers; commands still fail fast via the timeouts below.
    maxRetriesPerRequest: null,
    connectTimeout: env.EXTERNAL_CALL_TIMEOUT_MS,
    commandTimeout: env.EXTERNAL_CALL_TIMEOUT_MS,
    lazyConnect: false,
  });
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.client = createRedisConnection(env);
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
