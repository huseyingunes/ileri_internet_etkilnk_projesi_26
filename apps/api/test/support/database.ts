import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '../../src/generated/prisma/client.js';

const run = promisify(execFile);

export const API_DIR = fileURLToPath(new URL('../../', import.meta.url));
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));
const PRISMA_BIN = fileURLToPath(new URL('../../node_modules/.bin/prisma', import.meta.url));
const ROOT_PRISMA_BIN = fileURLToPath(
  new URL('../../../../node_modules/.bin/prisma', import.meta.url),
);

export interface MigratedDatabase {
  container: StartedPostgreSqlContainer;
  url: string;
  prisma: PrismaClient;
}

async function prismaBin(): Promise<string> {
  const { access } = await import('node:fs/promises');
  try {
    await access(PRISMA_BIN);
    return PRISMA_BIN;
  } catch {
    return ROOT_PRISMA_BIN;
  }
}

/** Runs the Prisma CLI exactly as deployments do (`prisma migrate deploy`, `db pull`). */
export async function prismaCli(args: string[], databaseUrl: string): Promise<string> {
  const { stdout } = await run(await prismaBin(), args, {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

export async function startMigratedDatabase(): Promise<MigratedDatabase> {
  const container = await new PostgreSqlContainer('postgres:18.7-trixie')
    .withCopyDirectoriesToContainer([{ source: MIGRATIONS_DIR, target: '/migrations' }])
    .start();
  const url = container.getConnectionUri();
  await prismaCli(['migrate', 'deploy'], url);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 4 }) });
  return { container, url, prisma };
}

/** Runs a SQL file inside the database container with psql (multi-statement scripts). */
export async function runSqlFile(container: StartedPostgreSqlContainer, path: string) {
  const result = await container.exec([
    'psql',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    container.getUsername(),
    '-d',
    container.getDatabase(),
    '-f',
    path,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`psql failed: ${result.output}`);
  }
}

const SQLSTATE = /\b(23505|23503|23514|23P01|23502|23001|P0001|22P02)\b/;
// Order matters: trigger messages are checked before generic constraint wording,
// because Prisma reports restrict_violation (23001) like a foreign key error.
const MESSAGE_STATES: [RegExp, string][] = [
  [/append-only/i, '23001'],
  [/at most 3 events/i, '23514'],
  [/unique constraint|duplicate key/i, '23505'],
  [/foreign key constraint/i, '23503'],
  [/check constraint|violates check/i, '23514'],
  [/exclusion constraint|conflicting key value violates exclusion/i, '23P01'],
];

/** Resolves to the SQLSTATE of a failed statement, or undefined if it succeeded. */
export async function sqlState(statement: Promise<unknown>): Promise<string | undefined> {
  try {
    await statement;
    return undefined;
  } catch (error) {
    const text = `${String(error)} ${JSON.stringify(error)}`;
    for (const [pattern, state] of MESSAGE_STATES) {
      if (pattern.test(text)) {
        return state;
      }
    }
    return SQLSTATE.exec(text)?.[1] ?? 'unknown';
  }
}
