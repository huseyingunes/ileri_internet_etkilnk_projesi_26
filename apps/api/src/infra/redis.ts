import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/**
 * Creates a Redis connection suitable for both commands and BullMQ.
 * `blocking` is for a BullMQ Worker: it waits for jobs with blocking commands
 * (BZPOPMIN) that legitimately outlast any command timeout, so only the
 * connect timeout applies there. Every other connection fails fast.
 */
export function createRedisConnection(env: Env, options: { blocking?: boolean } = {}): Redis {
  return new Redis(env.REDIS_URL, {
    // Required by BullMQ workers.
    maxRetriesPerRequest: null,
    connectTimeout: env.EXTERNAL_CALL_TIMEOUT_MS,
    ...(options.blocking === true ? {} : { commandTimeout: env.EXTERNAL_CALL_TIMEOUT_MS }),
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
