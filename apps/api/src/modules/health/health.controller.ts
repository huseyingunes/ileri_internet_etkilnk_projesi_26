import { Controller, Get, Header, Res } from '@nestjs/common';
import type { HealthResponse } from '@etkinlik/shared';
import type { Response } from 'express';
import { Public } from '../../common/auth/public.decorator.js';
import { ReadinessService } from './readiness.js';

@Controller('health')
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  /** Liveness: the process is up and the event loop responds. No dependencies. */
  @Public()
  @Get('live')
  @Header('Cache-Control', 'no-store')
  live(): HealthResponse {
    return { status: 'ok', checks: {} };
  }

  /** Readiness: dependencies are reachable; 503 tells Caddy/Compose to wait. */
  @Public()
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const result = await this.readiness.check();
    response.status(result.status === 'ok' ? 200 : 503);
    return result;
  }
}
