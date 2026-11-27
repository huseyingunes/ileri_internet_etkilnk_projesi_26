import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

export const DB_POOL_SIZE = Symbol('DB_POOL_SIZE');

/**
 * Prisma over the pg driver adapter. API and worker get separately sized pools
 * (API_DB_POOL_SIZE / WORKER_DB_POOL_SIZE).
 */
@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env, @Inject(DB_POOL_SIZE) poolSize: number) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: poolSize,
        connectionTimeoutMillis: env.EXTERNAL_CALL_TIMEOUT_MS,
        statement_timeout: 30_000,
      }),
    });
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(poolSize: number) {
    return {
      module: DatabaseModule,
      providers: [{ provide: DB_POOL_SIZE, useValue: poolSize }, DatabaseService],
      exports: [DatabaseService],
    };
  }
}
