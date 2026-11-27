import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse } from '@etkinlik/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { withTimeout } from '../../common/timeout.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DatabaseService } from '../../infra/database.js';
import { RedisService } from '../../infra/redis.js';

/** Shared by the API health controller and the worker health server. */
@Injectable()
export class ReadinessService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    @InjectPinoLogger(ReadinessService.name) private readonly logger: PinoLogger,
  ) {}

  async check(): Promise<HealthResponse> {
    const probes: Record<string, () => Promise<void>> = {
      database: () => this.database.ping(),
      redis: () => this.redis.ping(),
    };
    const entries = await Promise.all(
      Object.entries(probes).map(async ([name, probe]) => {
        try {
          await withTimeout(name, this.env.EXTERNAL_CALL_TIMEOUT_MS, probe());
          return [name, 'ok'] as const;
        } catch (error) {
          this.logger.warn({ err: error, dependency: name }, 'Readiness probe failed');
          return [name, 'error'] as const;
        }
      }),
    );
    const checks = Object.fromEntries(entries);
    const status = entries.every(([, value]) => value === 'ok') ? 'ok' : 'error';
    return { status, checks };
  }
}
