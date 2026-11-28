import { z } from 'zod';
import { SCORE_RULE_CODES } from '../rules/scoring.js';

export const scoreRuleCodeSchema = z.enum(SCORE_RULE_CODES);

export const seasonNameSchema = z.string().regex(/^[0-9]{4}-[0-9]{4}$/);

export const seasonQuerySchema = z.strictObject({ season: seasonNameSchema.optional() });

/** Points per rule: bounded, an integer; the zero-point rules are legitimate. */
export const scoreRuleUpdateSchema = z.strictObject({
  points: z.number().int().min(-1000).max(1000),
});

export const excuseCreateSchema = z.strictObject({
  reason: z.string().trim().min(1).max(2000),
});

export const excuseReviewSchema = z.strictObject({ decision: z.enum(['approve', 'reject']) });

export const excuseStatusSchema = z.enum(['pending', 'approved', 'rejected']);
