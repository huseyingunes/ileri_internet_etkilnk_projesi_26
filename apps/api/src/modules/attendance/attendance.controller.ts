import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { pageQuerySchema, publicIdSchema } from '@etkinlik/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { AttendanceService } from './attendance.service.js';

const qrQuery = z.strictObject({ kind: z.enum(['entry', 'exit', 'spot_check']).default('entry') });

/** Coordinates are validated but never stored (KVKK). */
const scanSchema = z.strictObject({
  token: z.string().min(16).max(1024),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000),
});

@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Roles('advisor', 'admin')
  @Get('events/:eventId/qr-token')
  qr(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', new ZodPipe(publicIdSchema)) eventId: string,
    @Query(new ZodPipe(qrQuery)) query: z.output<typeof qrQuery>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.attendance.qrToken(auth, eventId, query.kind);
  }

  @Roles('student')
  @Post('attendance-scans')
  @RateLimit({ name: 'attendance-scans', limit: 20, windowSeconds: 60, by: 'user' })
  async scan(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(scanSchema)) body: z.output<typeof scanSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.status(200).setHeader('Cache-Control', 'no-store');
    return await this.attendance.scan(auth, body);
  }

  @Roles('advisor', 'admin')
  @Get('events/:eventId/attendances')
  list(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', new ZodPipe(publicIdSchema)) eventId: string,
    @Query(new ZodPipe(pageQuerySchema.extend({ cursor: publicIdSchema.optional() })))
    query: z.output<typeof pageQuerySchema>,
  ) {
    return this.attendance.list(auth, eventId, query);
  }
}
