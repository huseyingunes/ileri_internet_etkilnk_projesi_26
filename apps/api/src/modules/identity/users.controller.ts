import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import {
  auditQuerySchema,
  pageQuerySchema,
  publicIdSchema,
  userAdminUpdateSchema,
  userListQuerySchema,
} from '@etkinlik/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { requestIdOf } from '../../common/logging.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { AuditQueryService } from './audit-query.service.js';
import { UsersService } from './users.service.js';

const listQuery = pageQuerySchema.extend(userListQuerySchema.shape);
const auditQuery = pageQuerySchema.extend(auditQuerySchema.shape);

@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auditQuery: AuditQueryService,
  ) {}

  @Roles('admin')
  @Get('users')
  list(@Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>) {
    return this.users.list(query);
  }

  @Roles('admin')
  @Patch('users/:userId')
  update(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Param('userId', new ZodPipe(publicIdSchema)) userId: string,
    @Body(new ZodPipe(userAdminUpdateSchema)) body: z.output<typeof userAdminUpdateSchema>,
  ) {
    return this.users.adminUpdate(
      { id: auth.userId, requestId: requestIdOf(request) },
      userId,
      body,
    );
  }

  @Roles('admin')
  @Get('audit-log')
  audit(@Query(new ZodPipe(auditQuery)) query: z.output<typeof auditQuery>) {
    return this.auditQuery.list(query);
  }
}
