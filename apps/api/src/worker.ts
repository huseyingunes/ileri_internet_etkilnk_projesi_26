import './instrument.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { armShutdownDeadline } from './common/shutdown.js';
import { loadEnv } from './config/env.js';
import { WorkerModule } from './worker/worker.module.js';

const env = loadEnv(process.env);
const context = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), {
  bufferLogs: true,
});
context.useLogger(context.get(Logger));
context.enableShutdownHooks();

armShutdownDeadline(env, () => {
  process.stderr.write('Worker graceful shutdown timed out; exiting.\n');
  process.exit(1);
});

await context.init();
