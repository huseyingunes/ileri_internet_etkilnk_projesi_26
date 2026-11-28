import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Public } from '../../common/auth/public.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';

/**
 * CSP and Trusted Types violation reports from the browser's Reporting API.
 * Logged (truncated) for monitoring, never stored; size and rate limited.
 */
@Controller('security-reports')
export class SecurityReportsController {
  constructor(
    @InjectPinoLogger(SecurityReportsController.name) private readonly logger: PinoLogger,
  ) {}

  @Public()
  @RateLimit({ name: 'security-reports', limit: 60, windowSeconds: 60, by: 'ip' })
  @Post()
  @HttpCode(204)
  receive(@Body() body: unknown): void {
    const text = JSON.stringify(body ?? null);
    this.logger.warn(
      { report: text.length > 2000 ? `${text.slice(0, 2000)}…` : text },
      'Security policy report',
    );
  }
}
