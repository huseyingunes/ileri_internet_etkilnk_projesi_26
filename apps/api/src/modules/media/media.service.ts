import { Injectable } from '@nestjs/common';
import { MEDIA_MAX_BYTES, uuidv7 } from '@etkinlik/shared';
import sharp from 'sharp';
import { z } from 'zod';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors.js';
import { DatabaseService } from '../../infra/database.js';
import { JobQueue } from '../../infra/queue.js';
import { InjectStorage, type ObjectStorage } from '../../infra/storage.js';

export const MEDIA_PROCESS_JOB = 'media.process';
const MAX_INPUT_PIXELS = 40_000_000;

/** Detected (not client-declared) formats that may be uploaded. */
const FORMAT_TO_TYPE: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heif: 'image/avif',
};

export const variantSchema = z.object({
  key: z.string(),
  format: z.enum(['avif', 'webp', 'jpeg']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type StoredVariant = z.infer<typeof variantSchema>;

export interface MediaView {
  id: string;
  status: 'pending' | 'ready' | 'failed';
  width?: number;
  height?: number;
  alt: string;
  variants: { url: string; format: 'avif' | 'webp' | 'jpeg'; width: number; height: number }[];
}

interface MediaRow {
  id: bigint;
  public_id: string;
  status: string;
  width: number | null;
  height: number | null;
  alt: string;
  variants: unknown;
  uploaded_by_user_id: bigint;
}

export const originalKey = (publicId: string) => `originals/${publicId}`;
export const variantKey = (publicId: string, width: number, format: string) =>
  `variants/${publicId}/${width.toString()}.${format}`;

export function toMediaView(row: MediaRow): MediaView {
  const variants = z.array(variantSchema).catch([]).parse(row.variants);
  const status = z.enum(['pending', 'ready', 'failed']).catch('failed').parse(row.status);
  return {
    id: row.public_id,
    status,
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
    alt: row.alt,
    variants: variants.map((v) => ({
      url: `/api/v1/media/${row.public_id}/variants/${v.width.toString()}.${v.format}`,
      format: v.format,
      width: v.width,
      height: v.height,
    })),
  };
}

/** Uploads, metadata and variant delivery. Owns media_objects. */
@Injectable()
export class MediaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: JobQueue,
    @InjectStorage() private readonly storage: ObjectStorage,
  ) {}

  async upload(
    caller: AuthContext,
    file: { buffer: Buffer; size: number },
    alt: string,
  ): Promise<MediaView> {
    if (file.size === 0 || file.size > MEDIA_MAX_BYTES) {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'file', message: 'Dosya 1 bayt ile 10 MB arasında olmalı.' },
      ]);
    }
    let format: string | undefined;
    try {
      const metadata = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
      format = metadata.format;
    } catch {
      format = undefined;
    }
    const contentType = format === undefined ? undefined : FORMAT_TO_TYPE[format];
    if (contentType === undefined) {
      throw new ValidationError('Gönderilen bilgiler doğrulanamadı.', [
        { field: 'file', message: 'Yalnızca JPEG, PNG, WebP ya da AVIF görseller yüklenebilir.' },
      ]);
    }

    const publicId = uuidv7();
    await this.storage.put(originalKey(publicId), file.buffer, contentType);
    const row = await this.db.media_objects.create({
      data: {
        public_id: publicId,
        storage_key: originalKey(publicId),
        content_type: contentType,
        byte_size: file.size,
        alt,
        uploaded_by_user_id: caller.userId,
      },
    });
    await this.queue.enqueue(
      MEDIA_PROCESS_JOB,
      { mediaId: row.id.toString() },
      { jobId: `media-${publicId}` },
    );
    return toMediaView(row);
  }

  async get(publicId: string): Promise<MediaView> {
    const row = await this.db.media_objects.findUnique({ where: { public_id: publicId } });
    if (row === null) throw new NotFoundError('Görsel bulunamadı.');
    return toMediaView(row);
  }

  /** For other modules: resolves a media id the caller may attach (own upload or admin). */
  async requireAttachable(caller: AuthContext, publicId: string): Promise<bigint> {
    const row = await this.db.media_objects.findUnique({ where: { public_id: publicId } });
    if (row === null || row.status === 'failed') throw new NotFoundError('Görsel bulunamadı.');
    if (caller.role !== 'admin' && row.uploaded_by_user_id !== caller.userId) {
      throw new ForbiddenError('Bu görseli kullanma yetkiniz yok.');
    }
    return row.id;
  }

  /** Views for ids owned by other modules, in one query. */
  async views(ids: readonly bigint[]): Promise<Map<bigint, MediaView>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.media_objects.findMany({ where: { id: { in: [...new Set(ids)] } } });
    return new Map(rows.map((row) => [row.id, toMediaView(row)]));
  }

  async variant(publicId: string, name: string): Promise<{ body: Buffer; contentType: string }> {
    const row = await this.db.media_objects.findUnique({ where: { public_id: publicId } });
    const [width, format] = name.split('.');
    const stored = z
      .array(variantSchema)
      .catch([])
      .parse(row?.variants ?? [])
      .find((v) => v.width.toString() === width && v.format === format);
    if (row === null || stored === undefined) throw new NotFoundError('Görsel bulunamadı.');
    const body = await this.storage.get(stored.key);
    if (body === undefined) throw new NotFoundError('Görsel bulunamadı.');
    return { body, contentType: `image/${stored.format}` };
  }
}
