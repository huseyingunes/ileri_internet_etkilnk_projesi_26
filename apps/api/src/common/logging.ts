import type { IncomingMessage, ServerResponse } from 'node:http';
import { uuidv7 } from '@etkinlik/shared';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env.js';

export const REQUEST_ID_HEADER = 'x-request-id';
const INCOMING_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * KVKK: personal data must never reach the logs in clear text. Request bodies
 * are not logged at all; these paths catch structured fields that do appear.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.studentNumber',
  '*.phone',
  '*.phoneNumber',
  '*.latitude',
  '*.longitude',
  '*.coordinates',
  '*.lat',
  '*.lng',
  '*.token',
  '*.password',
  '*.secret',
];

/** Reuses a well-formed upstream id (from Caddy) or creates a new UUIDv7. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && INCOMING_REQUEST_ID.test(incoming) ? incoming : uuidv7();
  res.setHeader('X-Request-Id', id);
  return id;
}

export function loggerParams(env: Env, options: { http: boolean }): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[MASKED]' },
      genReqId: resolveRequestId,
      autoLogging: options.http
        ? { ignore: (req) => req.url?.endsWith('/health/live') ?? false }
        : false,
      customProps: () => ({ service: options.http ? 'api' : 'worker' }),
      serializers: {
        req: (req: { id: unknown; method: unknown; url: unknown }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
      },
    },
  };
}
