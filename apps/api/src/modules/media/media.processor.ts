import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MEDIA_VARIANT_FORMATS, MEDIA_VARIANT_WIDTHS } from '@etkinlik/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import sharp from 'sharp';
import { z } from 'zod';
import { DatabaseService } from '../../infra/database.js';
import { type JobHandler, JobRegistry } from '../../infra/queue.js';
import { InjectStorage, type ObjectStorage } from '../../infra/storage.js';
import { MEDIA_PROCESS_JOB, type StoredVariant, variantKey } from './media.service.js';

const jobSchema = z.object({ mediaId: z.string().regex(/^[0-9]+$/) });

/** Widths to generate: every configured width the image can fill, at least the smallest. */
export function variantWidths(originalWidth: number): number[] {
  const fitting = MEDIA_VARIANT_WIDTHS.filter((width) => width <= originalWidth);
  return fitting.length > 0 ? [...fitting] : [Math.min(originalWidth, MEDIA_VARIANT_WIDTHS[0])];
}

/**
 * Worker job: derives AVIF/WebP variants in several widths, records the real
 * dimensions (after EXIF orientation) and strips metadata such as GPS tags.
 * Idempotent: a media object that is already ready is left alone.
 */
@Injectable()
export class MediaProcessor implements JobHandler, OnModuleInit {
  readonly jobName = MEDIA_PROCESS_JOB;

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: JobRegistry,
    @InjectStorage() private readonly storage: ObjectStorage,
    @InjectPinoLogger(MediaProcessor.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async handle(data: unknown): Promise<void> {
    const id = BigInt(jobSchema.parse(data).mediaId);
    const row = await this.db.media_objects.findUnique({ where: { id } });
    if (row === null || row.status === 'ready') return;

    const original = await this.storage.get(row.storage_key);
    if (original === undefined) {
      await this.db.media_objects.update({ where: { id }, data: { status: 'failed' } });
      this.logger.error({ mediaId: row.public_id }, 'Original image missing');
      return;
    }

    try {
      // rotate() applies EXIF orientation; output never carries input metadata.
      const oriented = await sharp(original, { limitInputPixels: 40_000_000 })
        .rotate()
        .toBuffer({ resolveWithObject: true });
      const variants: StoredVariant[] = [];
      for (const width of variantWidths(oriented.info.width)) {
        for (const format of MEDIA_VARIANT_FORMATS) {
          const pipeline = sharp(oriented.data).resize({ width, withoutEnlargement: true });
          const encoded =
            format === 'avif'
              ? pipeline.avif({ quality: 55, effort: 4 })
              : pipeline.webp({ quality: 75 });
          const output = await encoded.toBuffer({ resolveWithObject: true });
          const key = variantKey(row.public_id, width, format);
          await this.storage.put(key, output.data, `image/${format}`);
          variants.push({ key, format, width: output.info.width, height: output.info.height });
        }
      }
      await this.db.media_objects.update({
        where: { id },
        data: {
          status: 'ready',
          width: oriented.info.width,
          height: oriented.info.height,
          variants,
        },
      });
    } catch (error) {
      await this.db.media_objects.update({ where: { id }, data: { status: 'failed' } });
      throw error;
    }
  }
}
