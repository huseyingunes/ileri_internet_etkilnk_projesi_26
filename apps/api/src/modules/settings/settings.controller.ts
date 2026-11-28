import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { settingsUpdateSchema } from '@etkinlik/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { requestIdOf } from '../../common/logging.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
@Roles('admin')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  update(
    @CurrentUser() auth: AuthContext,
    @Req() request: Request,
    @Body(new ZodPipe(settingsUpdateSchema)) body: z.output<typeof settingsUpdateSchema>,
  ) {
    return this.settings.update(body, { id: auth.userId, requestId: requestIdOf(request) });
  }
}
