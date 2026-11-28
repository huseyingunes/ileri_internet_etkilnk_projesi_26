import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  pageQuerySchema,
  publicIdSchema,
  ratingCreateSchema,
  reasonAnswerSchema,
  reasonPromptQuerySchema,
} from '@etkinlik/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { EventsService } from '../events/events.service.js';
import { FeedbackService } from './feedback.service.js';

const idPipe = new ZodPipe(publicIdSchema);

@Controller()
export class FeedbackController {
  constructor(
    private readonly feedback: FeedbackService,
    private readonly events: EventsService,
  ) {}

  @Roles('student')
  @Get('me/reason-prompts')
  prompts(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(reasonPromptQuerySchema)) query: z.output<typeof reasonPromptQuerySchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.feedback.myPrompts(auth, query.answered);
  }

  @Roles('student')
  @Put('reason-prompts/:reasonPromptId/answer')
  @HttpCode(204)
  async answer(
    @CurrentUser() auth: AuthContext,
    @Param('reasonPromptId', idPipe) id: string,
    @Body(new ZodPipe(reasonAnswerSchema)) body: z.output<typeof reasonAnswerSchema>,
  ): Promise<void> {
    await this.feedback.answer(auth, id, body.answer);
  }

  @Roles('student')
  @Post('events/:eventId/ratings')
  rate(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Body(new ZodPipe(ratingCreateSchema)) body: z.output<typeof ratingCreateSchema>,
  ) {
    return this.feedback.rate(auth, eventId, body);
  }

  @Roles('advisor', 'admin')
  @Get('events/:eventId/ratings')
  ratings(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Query(new ZodPipe(pageQuerySchema.strict())) query: z.output<typeof pageQuerySchema>,
  ) {
    return this.feedback.ratingReport(auth, eventId, query);
  }

  @Roles('student', 'advisor', 'admin')
  @Get('events/:eventId/summary')
  async summary(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const report = await this.feedback.archiveSummary(auth, eventId);
    const internal = await this.events.findInternal(eventId);
    const viewer =
      internal === null ? undefined : await this.feedback.viewerState(auth, internal.id);
    const body = viewer === undefined ? report : { ...report, viewer };
    const etag = `W/"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'private, no-cache');
    if (ifNoneMatch?.split(',').some((tag) => tag.trim() === etag) === true) {
      response.status(304);
      return undefined;
    }
    return body;
  }
}
