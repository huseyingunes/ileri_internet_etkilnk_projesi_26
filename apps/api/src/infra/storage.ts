import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Global, Inject, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** Object storage port; the bucket is private, objects are served through the API. */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | undefined>;
  delete(key: string): Promise<void>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** In-memory fake for tests and local development without Garage. */
export class MemoryStorage implements ObjectStorage {
  /** Shared by the API and the worker when they run in one process (tests). */
  static readonly shared = new MemoryStorage();
  private readonly objects = new Map<string, Buffer>();

  put(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, Buffer.from(body));
    return Promise.resolve();
  }

  get(key: string): Promise<Buffer | undefined> {
    return Promise.resolve(this.objects.get(key));
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}

/** Garage through the S3 API, with a timeout on every call. */
export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly env: Env) {
    this.client = new S3Client({
      ...(env.S3_ENDPOINT === undefined ? {} : { endpoint: env.S3_ENDPOINT }),
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  private signal() {
    return { abortSignal: AbortSignal.timeout(this.env.EXTERNAL_CALL_TIMEOUT_MS * 4) };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
      this.signal(),
    );
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
        this.signal(),
      );
      if (!(result.Body instanceof Readable)) return undefined;
      const chunks: Buffer[] = [];
      for await (const chunk of result.Body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') return undefined;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
      this.signal(),
    );
  }
}

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ENV],
      useFactory: (env: Env): ObjectStorage =>
        env.STORAGE_DRIVER === 'memory' ? MemoryStorage.shared : new S3Storage(env),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}

export const InjectStorage = () => Inject(OBJECT_STORAGE);
