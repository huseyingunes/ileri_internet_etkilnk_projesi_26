import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { ConflictError, NotFoundError } from '../../common/errors.js';
import { isoFromDb, nowForDb } from '../../common/time.js';
import { DatabaseService } from '../../infra/database.js';
import { JobQueue } from '../../infra/queue.js';
import { InjectStorage, type ObjectStorage } from '../../infra/storage.js';
import { PersonalDataRegistry } from './personal-data.registry.js';

export const DATA_REQUEST_JOB = 'data-request.process';

export type DataRequestKind = 'export' | 'delete';

export interface DataRequestView {
  id: string;
  kind: DataRequestKind;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: string;
  completedAt?: string;
  downloadUrl?: string;
}

interface Row {
  public_id: string;
  kind: string;
  status: string;
  requested_at: Date;
  completed_at: Date | null;
}

const toView = (row: Row): DataRequestView => {
  const kind: DataRequestKind = row.kind === 'delete' ? 'delete' : 'export';
  const status =
    row.status === 'processing' || row.status === 'completed' || row.status === 'failed'
      ? row.status
      : 'pending';
  return {
    id: row.public_id,
    kind,
    status,
    requestedAt: isoFromDb(row.requested_at),
    ...(row.completed_at === null ? {} : { completedAt: isoFromDb(row.completed_at) }),
    ...(kind === 'export' && status === 'completed'
      ? { downloadUrl: `/api/v1/me/data-requests/${row.public_id}/download` }
      : {}),
  };
};

const exportKey = (publicId: string) => `exports/${publicId}.json`;

/** "Download my data" and "delete my data" (KVKK); processed in the worker. */
@Injectable()
export class DataRequestsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly queue: JobQueue,
    private readonly registry: PersonalDataRegistry,
    @InjectStorage() private readonly storage: ObjectStorage,
  ) {}

  async list(caller: AuthContext): Promise<{ items: DataRequestView[] }> {
    const rows = await this.db.data_requests.findMany({
      where: { user_id: caller.userId },
      orderBy: { requested_at: 'desc' },
      take: 20,
    });
    return { items: rows.map(toView) };
  }

  /** Idempotent: an open request of the same kind is returned instead of a new one. */
  async create(
    caller: AuthContext,
    kind: DataRequestKind,
  ): Promise<{ created: boolean; request: DataRequestView }> {
    const open = await this.db.data_requests.findFirst({
      where: { user_id: caller.userId, kind, status: { in: ['pending', 'processing'] } },
    });
    if (open !== null) return { created: false, request: toView(open) };
    const rows = await this.db.data_requests.createManyAndReturn({
      data: [{ user_id: caller.userId, kind }],
      skipDuplicates: true, // the partial unique index guards concurrent requests
    });
    const row =
      rows[0] ??
      (await this.db.data_requests.findFirstOrThrow({
        where: { user_id: caller.userId, kind, status: { in: ['pending', 'processing'] } },
      }));
    if (rows[0] !== undefined) {
      await this.queue.enqueue(
        DATA_REQUEST_JOB,
        { requestId: row.id.toString() },
        { jobId: `data-request-${row.id.toString()}` },
      );
    }
    return { created: rows[0] !== undefined, request: toView(row) };
  }

  /** Worker. Safe to retry: export overwrites the same object, erasers are idempotent. */
  async process(requestId: bigint): Promise<void> {
    const request = await this.db.data_requests.findUnique({ where: { id: requestId } });
    if (request === null || request.status === 'completed') return;
    await this.db.data_requests.update({
      where: { id: request.id },
      data: { status: 'processing' },
    });
    try {
      if (request.kind === 'export') {
        const document: Record<string, unknown> = {
          generatedAt: isoFromDb(nowForDb()),
          note: 'Etkinlik Platformu kişisel veri dökümü (KVKK). Konum koordinatları hiçbir zaman saklanmaz.',
        };
        for (const contributor of this.registry.all()) {
          document[contributor.section] = await contributor.export(request.user_id);
        }
        const body = Buffer.from(JSON.stringify(document, null, 2), 'utf8');
        const key = exportKey(request.public_id);
        await this.storage.put(key, body, 'application/json');
        // The private object is addressed by the request id; no media row is needed.
        await this.db.data_requests.update({
          where: { id: request.id },
          data: { status: 'completed', completed_at: nowForDb() },
        });
      } else {
        for (const contributor of this.registry.all()) await contributor.erase(request.user_id);
        await this.db.data_requests.update({
          where: { id: request.id },
          data: { status: 'completed', completed_at: nowForDb() },
        });
      }
    } catch (error) {
      await this.db.data_requests.update({
        where: { id: request.id },
        data: { status: 'failed' },
      });
      throw error;
    }
  }

  /** Only the owner downloads their completed export. */
  async download(caller: AuthContext, publicId: string): Promise<Buffer> {
    const request = await this.db.data_requests.findUnique({ where: { public_id: publicId } });
    if (request?.user_id !== caller.userId || request.kind !== 'export') {
      throw new NotFoundError('Talep bulunamadı.');
    }
    if (request.status !== 'completed') throw new ConflictError('Dışa aktarma henüz hazır değil.');
    const body = await this.storage.get(exportKey(request.public_id));
    if (body === undefined) throw new NotFoundError('Dosya bulunamadı.');
    return body;
  }
}
