import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { mapError } from './error-body.js';

/** The single global error handler: every failure leaves through here. */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalExceptionFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = String(request.id);

    const mapped = mapError(exception, requestId);
    if (mapped.internal) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    } else {
      this.logger.debug({ code: mapped.body.code, requestId }, 'Request rejected');
    }

    if (response.headersSent) {
      return;
    }
    response.status(mapped.status).set(mapped.headers).set('Cache-Control', 'no-store').json(mapped.body);
  }
}
