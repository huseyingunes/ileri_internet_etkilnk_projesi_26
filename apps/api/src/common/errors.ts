import type { FieldError } from '@etkinlik/shared';

/**
 * Base class for expected, client-visible failures. Anything that is not an
 * AppError (or a Nest HttpException) is treated as an internal error and its
 * details are never sent to the client.
 */
export abstract class AppError extends Error {
  abstract readonly status: number;
  abstract readonly code: string;
  readonly fieldErrors: readonly FieldError[];

  constructor(message: string, fieldErrors: readonly FieldError[] = []) {
    super(message);
    this.name = new.target.name;
    this.fieldErrors = fieldErrors;
  }
}

export class ValidationError extends AppError {
  readonly status = 422;
  readonly code = 'VALIDATION_FAILED';
}

export class UnauthenticatedError extends AppError {
  readonly status = 401;
  readonly code = 'UNAUTHENTICATED';
}

export class ForbiddenError extends AppError {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
}

export class NotFoundError extends AppError {
  readonly status = 404;
  readonly code = 'NOT_FOUND';
}

export class ConflictError extends AppError {
  readonly status = 409;
  readonly code = 'CONFLICT';
}

export class RateLimitedError extends AppError {
  readonly status = 429;
  readonly code = 'RATE_LIMITED';

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}
