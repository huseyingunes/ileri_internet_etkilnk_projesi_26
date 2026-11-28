import { createServer, type Server } from 'node:http';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ReadinessService } from '../modules/health/readiness.js';

/**
 * Minimal internal health endpoint for the worker (/live, /ready). It is only
 * reachable on the Compose network and is never proxied by Caddy.
 */
@Injectable()
export class WorkerHealthServer implements OnApplicationBootstrap, OnApplicationShutdown {
  private server: Server | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly readiness: ReadinessService,
  ) {}

  onApplicationBootstrap(): void {
    this.server = createServer((req, res) => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (req.method !== 'GET') {
        send(405, { status: 'error', checks: {} });
        return;
      }
      if (req.url === '/live') {
        send(200, { status: 'ok', checks: {} });
        return;
      }
      if (req.url === '/ready') {
        this.readiness.check().then(
          (result) => {
            send(result.status === 'ok' ? 200 : 503, result);
          },
          () => {
            send(503, { status: 'error', checks: {} });
          },
        );
        return;
      }
      send(404, { status: 'error', checks: {} });
    });
    this.server.listen(this.env.WORKER_HEALTH_PORT, '0.0.0.0');
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (server === undefined) {
      return;
    }
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
}
