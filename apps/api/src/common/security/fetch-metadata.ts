import type { IncomingMessage, ServerResponse } from 'node:http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Paths called by third parties or the browser's Reporting API, not by our pages. */
const EXEMPT_PREFIXES = ['/api/v1/webhooks/', '/api/v1/security-reports', '/api/v1/health/'];

export interface FetchMetadataInput {
  method: string;
  path: string;
  site: string | undefined;
  mode: string | undefined;
  dest: string | undefined;
  origin: string | undefined;
  appOrigin: string;
}

/**
 * Resource isolation policy (Fetch Metadata) plus an Origin check for clients
 * that do not send Sec-Fetch-* headers. Returns true when the request may proceed.
 */
export function isAllowedByFetchMetadata(input: FetchMetadataInput): boolean {
  if (EXEMPT_PREFIXES.some((prefix) => input.path.startsWith(prefix))) {
    return true;
  }
  const safe = SAFE_METHODS.has(input.method.toUpperCase());

  if (input.site === undefined) {
    // Non-browser clients and old browsers: fall back to the Origin header.
    return safe || input.origin === undefined || input.origin === input.appOrigin;
  }
  if (input.site === 'same-origin') {
    return input.origin === undefined || input.origin === input.appOrigin;
  }
  if (input.site === 'none') {
    // Typed URL or bookmark: only plain navigations.
    return safe;
  }
  // same-site or cross-site: allow only top-level GET navigations (e.g. the IdP redirect).
  return (
    input.method.toUpperCase() === 'GET' &&
    input.mode === 'navigate' &&
    input.dest !== 'object' &&
    input.dest !== 'embed'
  );
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value : undefined;
}

export function fetchMetadataMiddleware(appOrigin: string) {
  return (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const allowed = isAllowedByFetchMetadata({
      method: req.method ?? 'GET',
      path: (req.url ?? '/').split('?')[0] ?? '/',
      site: header(req, 'sec-fetch-site'),
      mode: header(req, 'sec-fetch-mode'),
      dest: header(req, 'sec-fetch-dest'),
      origin: header(req, 'origin'),
      appOrigin,
    });
    if (allowed) {
      next();
      return;
    }
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const requestId = typeof req.id === 'string' ? req.id : 'unknown';
    res.end(
      JSON.stringify({
        code: 'FORBIDDEN',
        message: 'Bu işlem için yetkiniz yok.',
        fieldErrors: [],
        requestId,
      }),
    );
  };
}
