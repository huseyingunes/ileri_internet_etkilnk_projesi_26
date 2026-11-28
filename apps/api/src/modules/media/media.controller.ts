import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MEDIA_MAX_BYTES, mediaVariantNameSchema, publicIdSchema } from '@etkinlik/shared';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentUser, Roles } from '../../common/auth/public.decorator.js';
import { ValidationError } from '../../common/errors.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.js';
import { ZodPipe } from '../../common/validation/zod.pipe.js';
import { MediaService } from './media.service.js';

const uploadFieldsSchema = z.object({ alt: z.string().trim().max(300).default('') });

interface UploadedImage {
  buffer: Buffer;
  size: number;
}

@Controller('media')
@Roles('student', 'advisor', 'admin')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RateLimit({ name: 'media-upload', limit: 30, windowSeconds: 3600, by: 'user' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_BYTES, files: 1, fields: 5 } }),
  )
  async upload(
    @CurrentUser() auth: AuthContext,
    @UploadedFile() file: UploadedImage | undefined,
    @Body(new ZodPipe(uploadFieldsSchema)) fields: z.output<typeof uploadFieldsSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (file === undefined) {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'file', message: 'Bir görsel dosyası seçin.' },
      ]);
    }
    const media = await this.media.upload(auth, file, fields.alt);
    response.status(202).setHeader('Location', `/api/v1/media/${media.id}`);
    return media;
  }

  @Get(':mediaId')
  get(@Param('mediaId', new ZodPipe(publicIdSchema)) mediaId: string) {
    return this.media.get(mediaId);
  }

  /** Variants never change, so the browser may cache them for a year. */
  @Get(':mediaId/variants/:variant')
  async variant(
    @Param('mediaId', new ZodPipe(publicIdSchema)) mediaId: string,
    @Param('variant', new ZodPipe(mediaVariantNameSchema)) variant: string,
    @Res() response: Response,
  ): Promise<void> {
    const { body, contentType } = await this.media.variant(mediaId, variant);
    response
      .status(200)
      .set({
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Length': String(body.length),
      })
      .end(body);
  }
}
