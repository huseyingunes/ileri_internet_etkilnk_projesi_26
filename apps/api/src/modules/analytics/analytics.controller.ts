import { Controller, Get, Query, Res } from '@nestjs/common';
import { categorySchema, seasonNameSchema } from '@etkinlik/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { AnalyticsService } from './analytics.service.js';

const overviewQuery = z.strictObject({
  season: seasonNameSchema.optional(),
  category: categorySchema.optional(),
});

@Controller('analytics')
@Roles('advisor', 'admin')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  overview(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(overviewQuery)) query: z.output<typeof overviewQuery>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-cache');
    return this.analytics.overview(auth, query.season, query.category);
  }
}
