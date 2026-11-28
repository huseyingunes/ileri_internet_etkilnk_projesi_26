import { Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { pageQuerySchema, publicIdSchema } from '@etkinlik/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { ApplicationsService } from './applications.service.js';

const listQuery = pageQuerySchema.extend({
  status: z.enum(['confirmed', 'waitlisted', 'cancelled']).optional(),
});
const idPipe = new ZodPipe(publicIdSchema);

@Controller()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Roles('student')
  @Post('events/:eventId/applications')
  @RateLimit({ name: 'applications', limit: 30, windowSeconds: 60, by: 'user' })
  async apply(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { created, application } = await this.applications.apply(auth, eventId);
    response.status(created ? 201 : 200).setHeader('Cache-Control', 'no-store');
    if (created) response.setHeader('Location', `/api/v1/applications/${application.id}`);
    return application;
  }

  @Roles('advisor', 'admin')
  @Get('events/:eventId/applications')
  list(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>,
  ) {
    return this.applications.listForEvent(auth, eventId, query);
  }

  @Roles('student')
  @Delete('applications/:applicationId')
  @HttpCode(204)
  async cancel(
    @CurrentUser() auth: AuthContext,
    @Param('applicationId', idPipe) applicationId: string,
  ): Promise<void> {
    await this.applications.cancel(auth, applicationId);
  }

  @Roles('student')
  @Get('me/applications')
  mine(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.applications.mine(auth, query);
  }
}
