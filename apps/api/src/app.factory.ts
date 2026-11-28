import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { assignRequestId } from './common/logging.js';
import { fetchMetadataMiddleware } from './common/security/fetch-metadata.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api/v1';

/** Builds the HTTP application; shared by main.ts and integration tests. */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
    bodyParser: false,
    // Keeps the raw JSON bytes for webhook signature checks (req.rawBody).
    rawBody: true,
  });
  // First middleware: every request gets a server-generated id before anything can reject it.
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    assignRequestId(req, res);
    next();
  });
  // CSRF / cross-site leak protection before anything else touches the request.
  app.use(fetchMetadataMiddleware(env.APP_ORIGIN));
  app.useLogger(app.get(Logger));

  // Only Caddy (on the private Compose network) may set X-Forwarded-* headers.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.disable('x-powered-by');
  app.useBodyParser('json', {
    limit: '100kb',
    type: ['application/json', 'application/reports+json', 'application/csp-report'],
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  // CORS stays disabled: the client is served from the same origin by Caddy.
  return app;
}
