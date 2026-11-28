import { type Instant, Temporal } from '@etkinlik/shared';

/*
 * The only place where Date appears in application code: Prisma's DateTime
 * fields take and return Date objects. All calculations use Temporal.
 */

export function toDbDate(instant: Instant): Date {
  // eslint-disable-next-line no-restricted-syntax -- database boundary; Prisma requires Date.
  return new Date(instant.epochMilliseconds);
}

export function fromDbDate(value: Date): Instant {
  return Temporal.Instant.fromEpochMilliseconds(value.getTime());
}

export const nowForDb = (): Date => toDbDate(Temporal.Now.instant());

export const isoFromDb = (value: Date): string => fromDbDate(value).toString();
