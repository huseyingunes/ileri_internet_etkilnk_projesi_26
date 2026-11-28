import { z } from 'zod';

/** The two "why" questions of the prompt (section 2, item 8). */
export const REASON_QUESTIONS = {
  why_attended: 'Bu etkinliğe neden katıldınız?',
  why_not_attended: 'Oy verdiğiniz bu etkinliğe neden katılmadınız?',
} as const;
export type ReasonKind = keyof typeof REASON_QUESTIONS;

export const reasonAnswerSchema = z.strictObject({
  answer: z.string().trim().min(1).max(2000),
});

export const reasonPromptQuerySchema = z.strictObject({
  answered: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export const ratingCreateSchema = z.strictObject({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(2000).optional(),
});
