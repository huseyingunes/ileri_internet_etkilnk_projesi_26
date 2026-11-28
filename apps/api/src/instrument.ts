import { SENTRY_DATA_COLLECTION } from '@etkinlik/shared';
import * as Sentry from '@sentry/nestjs';

// Must be imported before anything else so Sentry can instrument modules.
// Sentry stays off unless a DSN is configured; no personal data is collected.
const dsn = process.env['SENTRY_DSN'];
if (dsn !== undefined && dsn !== '') {
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    dataCollection: {
      ...SENTRY_DATA_COLLECTION,
      httpBodies: [],
    },
    tracesSampleRate: 0,
  });
}
