import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  communityCreateSchema,
  communityUpdateSchema,
  membershipCreateSchema,
  pageQuerySchema,
  publicIdSchema,
  searchQuerySchema,
} from '@etkinlik/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { requestIdOf } from '../../common/logging.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { CommunitiesService } from './communities.service.js';

const listQuery = pageQuerySchema.extend(searchQuerySchema.shape);
const idPipe = new ZodPipe(publicIdSchema);

@Controller('communities')
export class CommunitiesController {
  constructor(private readonly communities: CommunitiesService) {}

  @Roles('student', 'advisor', 'admin')
  @Get()
  list(@Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>) {
    return this.communities.list(query);
  }

  @Roles('admin')
  @Post()
  async create(
    @Body(new ZodPipe(communityCreateSchema)) body: z.output<typeof communityCreateSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const community = await this.communities.create(body);
    response.setHeader('Location', `/api/v1/communities/${community.id}`);
    response.status(201);
    return community;
  }

  @Roles('student', 'advisor', 'admin')
  @Get(':communityId')
  get(@Param('communityId', idPipe) communityId: string) {
    return this.communities.get(communityId);
  }

  @Roles('admin')
  @Patch(':communityId')
  update(
    @Param('communityId', idPipe) communityId: string,
    @Body(new ZodPipe(communityUpdateSchema)) body: z.output<typeof communityUpdateSchema>,
  ) {
    return this.communities.update(communityId, body);
  }

  @Roles('advisor', 'admin')
  @Get(':communityId/members')
  members(
    @CurrentUser() auth: AuthContext,
    @Param('communityId', idPipe) communityId: string,
    @Query(new ZodPipe(pageQuerySchema)) query: z.output<typeof pageQuerySchema>,
  ) {
    return this.communities.listMembers(communityId, auth, query);
  }

  @Roles('advisor', 'admin')
  @Post(':communityId/members')
  @HttpCode(204)
  addMember(
    @CurrentUser() auth: AuthContext,
    @Param('communityId', idPipe) communityId: string,
    @Body(new ZodPipe(membershipCreateSchema)) body: z.output<typeof membershipCreateSchema>,
  ) {
    return this.communities.addMember(communityId, auth, body.userId);
  }

  @Roles('advisor', 'admin')
  @Delete(':communityId/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() auth: AuthContext,
    @Param('communityId', idPipe) communityId: string,
    @Param('userId', idPipe) userId: string,
  ) {
    return this.communities.removeMember(communityId, auth, userId);
  }

  @Roles('admin')
  @Post(':communityId/advisors')
  @HttpCode(204)
  addAdvisor(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('communityId', idPipe) communityId: string,
    @Body(new ZodPipe(membershipCreateSchema)) body: z.output<typeof membershipCreateSchema>,
  ) {
    return this.communities.addAdvisor(communityId, auth, body.userId, requestIdOf(request));
  }

  @Roles('admin')
  @Delete(':communityId/advisors/:userId')
  @HttpCode(204)
  removeAdvisor(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('communityId', idPipe) communityId: string,
    @Param('userId', idPipe) userId: string,
  ) {
    return this.communities.removeAdvisor(communityId, auth, userId, requestIdOf(request));
  }
}
