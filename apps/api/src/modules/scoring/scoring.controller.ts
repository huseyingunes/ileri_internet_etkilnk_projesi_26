import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  excuseCreateSchema,
  excuseReviewSchema,
  excuseStatusSchema,
  pageQuerySchema,
  publicIdSchema,
  scoreRuleCodeSchema,
  scoreRuleUpdateSchema,
  seasonNameSchema,
  seasonQuerySchema,
} from '@etkinlik/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { requestIdOf } from '../../common/logging.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { ExcusesService } from './excuses.service.js';
import { ScoringService } from './scoring.service.js';

const entriesQuery = pageQuerySchema.extend({ season: seasonNameSchema.optional() }).strict();
const excuseListQuery = pageQuerySchema.extend({ status: excuseStatusSchema.optional() }).strict();
const leaderboardQuery = seasonQuerySchema;

@Controller()
export class ScoringController {
  constructor(
    private readonly scoring: ScoringService,
    private readonly excuses: ExcusesService,
  ) {}

  @Roles('student')
  @Get('me/score')
  myScore(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(seasonQuerySchema)) query: z.output<typeof seasonQuerySchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.scoring.myScore(auth, query.season);
  }

  @Roles('student')
  @Get('me/score-entries')
  myEntries(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(entriesQuery)) query: z.output<typeof entriesQuery>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.scoring.myEntries(auth, query.season, query);
  }

  @Roles('student', 'advisor', 'admin')
  @Get('score-rules')
  rules() {
    return this.scoring.listRules();
  }

  @Roles('admin')
  @Put('score-rules/:code')
  updateRule(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('code', new ZodPipe(scoreRuleCodeSchema)) code: z.output<typeof scoreRuleCodeSchema>,
    @Body(new ZodPipe(scoreRuleUpdateSchema)) body: z.output<typeof scoreRuleUpdateSchema>,
  ) {
    return this.scoring.updateRule(code, body.points, {
      ...auth,
      requestId: requestIdOf(request),
    });
  }

  @Roles('student', 'advisor', 'admin')
  @Get('seasons')
  seasons() {
    return this.scoring.listSeasons();
  }

  @Roles('student', 'advisor', 'admin')
  @Get('leaderboard')
  async leaderboard(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(leaderboardQuery)) query: z.output<typeof leaderboardQuery>,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const body = await this.scoring.leaderboard(auth, query.season);
    const etag = `W/"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'private, no-cache');
    if (ifNoneMatch?.split(',').some((tag) => tag.trim() === etag) === true) {
      response.status(304);
      return undefined;
    }
    return body;
  }

  @Roles('advisor', 'admin')
  @Get('events/:eventId/excuses')
  listExcuses(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', new ZodPipe(publicIdSchema)) eventId: string,
    @Query(new ZodPipe(excuseListQuery)) query: z.output<typeof excuseListQuery>,
  ) {
    return this.excuses.list(auth, eventId, query.status, query);
  }

  @Roles('student')
  @Post('events/:eventId/excuses')
  submitExcuse(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', new ZodPipe(publicIdSchema)) eventId: string,
    @Body(new ZodPipe(excuseCreateSchema)) body: z.output<typeof excuseCreateSchema>,
  ) {
    return this.excuses.submit(auth, eventId, body.reason);
  }

  @Roles('advisor', 'admin')
  @Patch('excuses/:excuseId')
  reviewExcuse(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('excuseId', new ZodPipe(publicIdSchema)) excuseId: string,
    @Body(new ZodPipe(excuseReviewSchema)) body: z.output<typeof excuseReviewSchema>,
  ) {
    return this.excuses.review(
      { ...auth, requestId: requestIdOf(request) },
      excuseId,
      body.decision,
    );
  }
}
