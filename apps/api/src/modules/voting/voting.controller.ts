import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import {
  ballotSelectionSchema,
  dateQuerySchema,
  publicIdSchema,
  tieDecisionSchema,
  voteCreateSchema,
  votingDateSchema,
} from '@etkinlik/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { requestIdOf } from '../../common/logging.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { VotingService } from './voting.service.js';

@Controller()
export class VotingController {
  constructor(private readonly voting: VotingService) {}

  @Roles('student', 'advisor', 'admin')
  @Get('ballots')
  ballot(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(dateQuerySchema)) query: z.output<typeof dateQuerySchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.voting.ballot(auth, query.date);
  }

  @Roles('admin')
  @Put('ballots/:date')
  setBallot(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('date', new ZodPipe(votingDateSchema)) date: string,
    @Body(new ZodPipe(ballotSelectionSchema)) body: z.output<typeof ballotSelectionSchema>,
  ) {
    return this.voting.setBallot(date, body, { ...auth, requestId: requestIdOf(request) });
  }

  @Roles('student')
  @Post('votes')
  @RateLimit({ name: 'votes', limit: 30, windowSeconds: 60, by: 'user' })
  async vote(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(voteCreateSchema)) body: z.output<typeof voteCreateSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { created, vote } = await this.voting.vote(auth, body.ballotEntryId);
    response.status(created ? 201 : 200).setHeader('Cache-Control', 'no-store');
    return vote;
  }

  @Roles('student', 'advisor', 'admin')
  @Get('voting-results')
  results(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(dateQuerySchema)) query: z.output<typeof dateQuerySchema>,
  ) {
    return this.voting.results(auth, query.date);
  }

  @Roles('admin')
  @Put('voting-results/:resultId/tie-decision')
  decideTie(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('resultId', new ZodPipe(publicIdSchema)) resultId: string,
    @Body(new ZodPipe(tieDecisionSchema)) body: z.output<typeof tieDecisionSchema>,
  ) {
    return this.voting.decideTie(resultId, body.eventId, {
      ...auth,
      requestId: requestIdOf(request),
    });
  }
}
