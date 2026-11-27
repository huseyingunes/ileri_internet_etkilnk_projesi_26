import { defineConfig } from 'prisma/config';

// The schema has no models yet; the data model is written in Phase 1.
// DATABASE_URL is only needed by commands that talk to the database (migrate),
// not by `prisma generate`, so it is read lazily without a default.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
