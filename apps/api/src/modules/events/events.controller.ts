import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  eventCancellationSchema,
  eventCreateSchema,
  eventListQuerySchema,
  eventReviewSchema,
  eventUpdateSchema,
  mediaRefSchema,
  pageQuerySchema,
  publicIdSchema,
} from '@etkinlik/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { requestIdOf } from '../../common/logging.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { EventsService } from './events.service.js';

const listQuery = pageQuerySchema.extend(eventListQuerySchema.shape);
const idPipe = new ZodPipe(publicIdSchema);

/** Weak ETag over the response body; `If-None-Match` hits answer 304 without a body. */
function withEtag(response: Response, ifNoneMatch: string | undefined, body: unknown): unknown {
  const etag = `W/"${createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;
  response.setHeader('ETag', etag);
  response.setHeader('Cache-Control', 'private, no-cache');
  if (ifNoneMatch?.split(',').some((tag) => tag.trim() === etag) === true) {
    response.status(304);
    return undefined;
  }
  return body;
}

@Controller('events')
@Roles('student', 'advisor', 'admin')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(response, ifNoneMatch, await this.events.list(auth, query));
  }

  @Post()
  async create(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(eventCreateSchema)) body: z.output<typeof eventCreateSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const event = await this.events.create(auth, body);
    response.status(201).setHeader('Location', `/api/v1/events/${event.id}`);
    return event;
  }

  @Get(':eventId')
  async get(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return withEtag(response, ifNoneMatch, await this.events.get(eventId, auth));
  }

  @Patch(':eventId')
  update(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Body(new ZodPipe(eventUpdateSchema)) body: z.output<typeof eventUpdateSchema>,
  ) {
    return this.events.update(eventId, auth, body);
  }

  @Roles('advisor', 'admin')
  @Put(':eventId/review')
  review(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Body(new ZodPipe(eventReviewSchema)) body: z.output<typeof eventReviewSchema>,
  ) {
    return this.events.review(eventId, auth, body);
  }

  @Roles('advisor', 'admin')
  @Put(':eventId/cancellation')
  cancel(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('eventId', idPipe) eventId: string,
    @Body(new ZodPipe(eventCancellationSchema)) body: z.output<typeof eventCancellationSchema>,
  ) {
    return this.events.cancel(eventId, auth, body.reason, requestIdOf(request));
  }

  @Put(':eventId/cover')
  setCover(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
    @Body(new ZodPipe(mediaRefSchema)) body: z.output<typeof mediaRefSchema>,
  ) {
    return this.events.setCover(eventId, auth, body.mediaId);
  }

  @Delete(':eventId/cover')
  @HttpCode(204)
  async removeCover(
    @CurrentUser() auth: AuthContext,
    @Param('eventId', idPipe) eventId: string,
  ): Promise<void> {
    await this.events.setCover(eventId, auth, null);
  }

  @Get(':id/photos')
  async photos(@CurrentUser() auth: AuthContext, @Param('id', idPipe) id: string) {
    return await this.events.listPhotos(id, auth);
  }

  @Roles('advisor', 'admin')
  @Post(':id/photos')
  @HttpCode(204)
  async addPhoto(
    @CurrentUser() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(mediaRefSchema)) body: z.output<typeof mediaRefSchema>,
  ): Promise<void> {
    await this.events.addPhoto(id, auth, body.mediaId);
  }

  @Roles('advisor', 'admin')
  @Delete(':id/photos/:mediaId')
  @HttpCode(204)
  async removePhoto(
    @CurrentUser() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Param('mediaId', idPipe) mediaId: string,
  ): Promise<void> {
    await this.events.removePhoto(id, auth, mediaId);
  }
}
