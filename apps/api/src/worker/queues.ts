import type { JobsOptions } from 'bullmq';

export const QUEUE_NAMES = {
  system: 'system',
  deadLetter: 'dead-letter',
} as const;

/**
 * Every job is idempotent and retried with exponential backoff plus jitter.
 * Exhausted jobs are copied to the dead-letter queue and raise an alert log.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2_000, jitter: 0.5 },
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
