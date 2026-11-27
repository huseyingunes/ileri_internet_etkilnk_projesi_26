import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mapError } from './error-body.js';
import { ForbiddenError, RateLimitedError, UnauthenticatedError } from './errors.js';

const requestId = '01890a5d-ac96-774b-bcce-b302099a8057';

describe('mapError', () => {
  it('keeps 401 and 403 distinct', () => {
    expect(mapError(new UnauthenticatedError('x'), requestId).status).toBe(401);
    expect(mapError(new ForbiddenError('x'), requestId).status).toBe(403);
    expect(mapError(new UnauthorizedException(), requestId).body.code).toBe('UNAUTHENTICATED');
    expect(mapError(new ForbiddenException(), requestId).body.code).toBe('FORBIDDEN');
  });

  it('maps Zod failures to 422 with field errors', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    expect(result.success).toBe(false);
    const mapped = mapError(result.error, requestId);
    expect(mapped.status).toBe(422);
    expect(mapped.body.fieldErrors[0]?.field).toBe('name');
  });

  it('adds Retry-After for rate limiting', () => {
    const mapped = mapError(new RateLimitedError('slow down', 30), requestId);
    expect(mapped.status).toBe(429);
    expect(mapped.headers['Retry-After']).toBe('30');
  });

  it('never leaks internal error details', () => {
    const mapped = mapError(new Error('connection to db-internal:5432 failed'), requestId);
    expect(mapped.status).toBe(500);
    expect(mapped.internal).toBe(true);
    expect(JSON.stringify(mapped.body)).not.toContain('db-internal');
  });

  it('uses a stable code for Nest HTTP exceptions', () => {
    const mapped = mapError(new NotFoundException('Cannot GET /secret/path'), requestId);
    expect(mapped.body).toEqual({
      code: 'NOT_FOUND',
      message: 'Aradığınız kaynak bulunamadı.',
      fieldErrors: [],
      requestId,
    });
  });
});
