import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  interestUpdateSchema,
  notificationListQuerySchema,
  notificationPreferenceListSchema,
  notificationUpdateSchema,
  pageQuerySchema,
  publicIdSchema,
} from '@etkinlik/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Public, Roles } from '../../common/auth/public.decorator.js';
import { ForbiddenError } from '../../common/errors.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { InterestsService } from './interests.service.js';
import { NotificationsService } from './notifications.service.js';
import { Notifier } from './notifier.service.js';
import { verifyToken, verifyWhatsAppSignature } from './whatsapp-signature.js';

const listQuery = pageQuerySchema.extend(notificationListQuerySchema.shape).strict();
const verifyQuery = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string().max(256),
  'hub.challenge': z.string().max(256),
});

@Controller()
export class NotificationsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationsService,
    private readonly notifier: Notifier,
    private readonly interests: InterestsService,
  ) {}

  @Roles('student')
  @Get('me/interests')
  myInterests(@CurrentUser() auth: AuthContext) {
    return this.interests.list(auth);
  }

  @Roles('student')
  @Put('me/interests')
  replaceInterests(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(interestUpdateSchema)) body: z.output<typeof interestUpdateSchema>,
  ) {
    return this.interests.replaceSelected(auth, body.selected);
  }

  @Roles('student', 'advisor', 'admin')
  @Get('me/notifications')
  list(
    @CurrentUser() auth: AuthContext,
    @Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.notifications.list(auth, query.unread, query);
  }

  @Roles('student', 'advisor', 'admin')
  @Patch('me/notifications/:notificationId')
  @HttpCode(204)
  async markRead(
    @CurrentUser() auth: AuthContext,
    @Param('notificationId', new ZodPipe(publicIdSchema)) id: string,
    @Body(new ZodPipe(notificationUpdateSchema)) _body: z.output<typeof notificationUpdateSchema>,
  ): Promise<void> {
    await this.notifications.markRead(auth, id);
  }

  @Roles('student', 'advisor', 'admin')
  @Get('me/notification-preferences')
  preferences(@CurrentUser() auth: AuthContext) {
    return this.notifications.preferences(auth);
  }

  @Roles('student', 'advisor', 'admin')
  @Put('me/notification-preferences')
  replacePreferences(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(notificationPreferenceListSchema))
    body: z.output<typeof notificationPreferenceListSchema>,
  ) {
    return this.notifications.replacePreferences(auth, body.items);
  }

  /** Meta's subscription handshake; answers the challenge only for the right token. */
  @Public()
  @Get('webhooks/whatsapp')
  @RateLimit({ name: 'whatsapp-webhook-verify', limit: 30, windowSeconds: 60, by: 'ip' })
  verify(
    @Query(new ZodPipe(verifyQuery)) query: z.output<typeof verifyQuery>,
    @Res({ passthrough: true }) response: Response,
  ): string {
    const expected = this.env.WHATSAPP_VERIFY_TOKEN;
    if (expected === undefined || !verifyToken(expected, query['hub.verify_token'])) {
      throw new ForbiddenError('Doğrulama başarısız.');
    }
    response.type('text/plain');
    return query['hub.challenge'];
  }

  /**
   * Status events. The signature is checked over the raw body; processing
   * happens in the worker, so the response is immediate.
   */
  @Public()
  @Post('webhooks/whatsapp')
  @HttpCode(200)
  @RateLimit({ name: 'whatsapp-webhook', limit: 600, windowSeconds: 60, by: 'ip' })
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    const secret = this.env.WHATSAPP_APP_SECRET;
    const raw = request.rawBody;
    if (
      secret === undefined ||
      raw === undefined ||
      !verifyWhatsAppSignature(secret, raw, signature)
    ) {
      throw new ForbiddenError('İmza doğrulanamadı.');
    }
    await this.notifier.receiveWebhook(body);
  }
}
