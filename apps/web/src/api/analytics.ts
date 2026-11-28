import { categorySchema } from '@etkinlik/shared';
import { z } from 'zod';
import { api } from './client';

const overviewSchema = z.object({
  season: z.string(),
  registeredStudents: z.number(),
  completedEvents: z.number(),
  voterAttendanceRate: z.number().nullable(),
  averageRating: z.number().nullable(),
  byCategory: z.array(
    z.object({ category: categorySchema, votes: z.number(), attendees: z.number() }),
  ),
  nonAttendanceReasons: z.array(z.object({ label: z.string(), count: z.number() })),
  communities: z.array(
    z.object({
      community: z.object({ id: z.string(), name: z.string() }),
      completedEvents: z.number(),
      wins: z.number(),
      averageRating: z.number().nullable(),
    }),
  ),
  attendanceByHour: z.array(z.object({ hour: z.number(), attendees: z.number() })),
});
export type AnalyticsOverview = z.infer<typeof overviewSchema>;

export const getAnalyticsOverview = (season?: string, category?: string) => {
  const params = new URLSearchParams();
  if (season !== undefined) params.set('season', season);
  if (category !== undefined) params.set('category', category);
  return api(overviewSchema, `/analytics/overview?${params.toString()}`);
};
