import 'reflect-metadata';
import { nowInstant } from '@etkinlik/shared';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { loggerParams } from './common/logging.js';
import { nowForDb } from './common/time.js';
import { ConfigModule } from './config/config.module.js';
import { loadEnv } from './config/env.js';
import { DatabaseModule, DatabaseService } from './infra/database.js';
import { RedisModule } from './infra/redis.js';
import { issueQrToken } from './modules/attendance/qr-token.js';
import { SessionStore } from './modules/identity/session.store.js';

/*
 * Prepares a k6 load test (tools/load/README.md) against a LOCAL or STAGING
 * stack: N students with location consent and a confirmed seat on one event,
 * a session per student and one QR token. Refuses to run in production.
 *
 *   node dist/load-prepare.js <eventPublicId> <students> [qrLifetimeSeconds]
 *
 * Prints JSON on stdout: { sessions: string[], qrToken: string, location }.
 */
const env = loadEnv(process.env);
if (env.NODE_ENV === 'production') {
  process.stderr.write('load-prepare refuses to run with NODE_ENV=production.\n');
  process.exit(1);
}
const [eventId, countText, lifetimeText] = process.argv.slice(2);
const count = Number(countText);
const lifetime = Number(lifetimeText ?? '600');
if (eventId === undefined || !Number.isInteger(count) || count < 1 || count > 5000) {
  process.stderr.write(
    'usage: load-prepare <eventPublicId> <students 1-5000> [qrLifetimeSeconds]\n',
  );
  process.exit(2);
}

@Module({
  imports: [
    ConfigModule.forRoot(env),
    LoggerModule.forRoot(loggerParams(env, { http: false })),
    DatabaseModule.forRoot(2),
    RedisModule,
  ],
  providers: [SessionStore],
})
class LoadPrepareModule {}

const context = await NestFactory.createApplicationContext(LoadPrepareModule, { logger: false });
try {
  const db = context.get(DatabaseService);
  const sessions = context.get(SessionStore);
  const event = await db.events.findUniqueOrThrow({ where: { public_id: eventId } });
  const students = await db.users.findMany({
    where: { role: 'student', is_active: true },
    orderBy: { id: 'asc' },
    take: count,
  });
  const tokens: string[] = [];
  for (const student of students) {
    await db.consents.createMany({
      data: [{ user_id: student.id, kind: 'location', text_version: 'load-test' }],
      skipDuplicates: true,
    });
    await db.applications.upsert({
      where: { student_user_id_event_id: { student_user_id: student.id, event_id: event.id } },
      create: {
        student_user_id: student.id,
        event_id: event.id,
        status: 'confirmed',
        confirmed_at: nowForDb(),
      },
      update: { status: 'confirmed', confirmed_at: nowForDb(), waitlist_position: null },
    });
    tokens.push(await sessions.create(student.id));
  }
  const { token } = issueQrToken(env.QR_SIGNING_SECRET, {
    eventId: event.public_id,
    kind: 'entry',
    nowSeconds: Math.floor(nowInstant().epochMilliseconds / 1000),
    lifetimeSeconds: lifetime,
  });
  process.stdout.write(
    `${JSON.stringify({
      sessions: tokens,
      qrToken: token,
      location: { latitude: event.latitude, longitude: event.longitude },
    })}\n`,
  );
} finally {
  await context.close();
}
