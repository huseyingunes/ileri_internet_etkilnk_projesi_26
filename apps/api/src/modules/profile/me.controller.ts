import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Put } from '@nestjs/common';
import {
  consentGrantSchema,
  consentKindSchema,
  meUpdateSchema,
  type ConsentKind,
} from '@etkinlik/shared';
import type { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { ValidationError } from '../../common/errors.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { CommunitiesService } from '../communities/communities.service.js';
import { ConsentsService } from '../identity/consents.service.js';
import { UsersService } from '../identity/users.service.js';

/** The caller's own profile; the user is always taken from the session. */
@Controller('me')
@Roles('student', 'advisor', 'admin')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly consents: ConsentsService,
    private readonly communities: CommunitiesService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async me(@CurrentUser() auth: AuthContext) {
    const [profile, communities] = await Promise.all([
      this.users.getProfile(auth.userId),
      this.communities.forUser(auth.userId),
    ]);
    return { ...profile, communities };
  }

  /** A phone number is only kept for WhatsApp notifications, which need explicit consent. */
  @Patch()
  @Header('Cache-Control', 'no-store')
  @RateLimit({ name: 'profile-update', limit: 20, windowSeconds: 3600, by: 'user' })
  async update(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodPipe(meUpdateSchema)) body: z.output<typeof meUpdateSchema>,
  ) {
    if (body.phone !== undefined) {
      if (body.phone !== null && !(await this.consents.isGranted(auth.userId, 'whatsapp'))) {
        throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
          { field: 'phone', message: 'Telefon numarası için önce WhatsApp iznini vermelisiniz.' },
        ]);
      }
      await this.users.setPhone(auth.userId, body.phone);
    }
    return await this.me(auth);
  }

  @Get('consents')
  async consentList(@CurrentUser() auth: AuthContext) {
    return { items: await this.consents.list(auth.userId) };
  }

  @Put('consents/:kind')
  grant(
    @CurrentUser() auth: AuthContext,
    @Param('kind', new ZodPipe(consentKindSchema)) kind: ConsentKind,
    @Body(new ZodPipe(consentGrantSchema)) body: z.output<typeof consentGrantSchema>,
  ) {
    return this.consents.grant(auth.userId, kind, body.textVersion);
  }

  /** Revoking WhatsApp consent also removes the stored phone number. */
  @Delete('consents/:kind')
  @HttpCode(204)
  async revoke(
    @CurrentUser() auth: AuthContext,
    @Param('kind', new ZodPipe(consentKindSchema)) kind: ConsentKind,
  ): Promise<void> {
    await this.consents.revoke(auth.userId, kind);
    if (kind === 'whatsapp') {
      await this.users.setPhone(auth.userId, null);
    }
  }
}
