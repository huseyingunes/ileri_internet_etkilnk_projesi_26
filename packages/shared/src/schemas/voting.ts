import { z } from 'zod';
import { publicIdSchema } from './identity.js';

export const votingDateSchema = z.iso.date();

export const ballotSelectionSchema = z.strictObject({
  science: z.array(publicIdSchema).length(3),
  culture: z.array(publicIdSchema).length(3),
  sports: z.array(publicIdSchema).length(3),
});

export const voteCreateSchema = z.strictObject({ ballotEntryId: publicIdSchema });

export const tieDecisionSchema = z.strictObject({ eventId: publicIdSchema });

export const dateQuerySchema = z.strictObject({ date: votingDateSchema.optional() });

/** Admin-editable settings; zero, empty and negative values are rejected. */
export const settingsSchema = z.strictObject({
  minimumVotesToWin: z.number().int().min(1).max(100_000),
  defaultAttendanceRadiusM: z.number().int().min(1).max(5000),
  defaultQrRefreshSeconds: z.number().int().min(20).max(30),
  showLiveVoteCounts: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  minimumVotesToWin: 1,
  defaultAttendanceRadiusM: 100,
  defaultQrRefreshSeconds: 25,
  showLiveVoteCounts: false,
};

export const settingsUpdateSchema = settingsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'En az bir alan gönderilmeli.');
