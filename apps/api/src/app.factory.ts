import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'api/v1';

/** Builds the HTTP application; shared by main.ts and integration tests. */
export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));

  // Only Caddy (on the private Compose network) may set X-Forwarded-* headers.
  app.set('trust proxy', 'loopback, uniquelocal');
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '100kb' });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  // CORS stays disabled: the client is served from the same origin by Caddy.
  return app;
}
