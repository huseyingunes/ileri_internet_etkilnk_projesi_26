import type { Env } from '../config/env.js';

/**
 * Nest closes the HTTP server and providers on SIGTERM/SIGINT, letting
 * in-flight requests and jobs finish. This is the hard stop if that hangs.
 */
export function armShutdownDeadline(env: Env, onTimeout: () => void): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      setTimeout(onTimeout, env.SHUTDOWN_TIMEOUT_MS).unref();
    });
  }
}
