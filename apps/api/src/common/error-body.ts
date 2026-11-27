import { HttpException } from '@nestjs/common';
import type { ErrorBody } from '@etkinlik/shared';
import { ZodError } from 'zod';
import { AppError, RateLimitedError } from './errors.js';

export interface MappedError {
  readonly status: number;
  readonly body: ErrorBody;
  readonly headers: Readonly<Record<string, string>>;
  /** True when the error was unexpected and must be logged with its stack. */
  readonly internal: boolean;
}

const STATUS_CODES: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
};

/** Client-facing messages are Turkish UI strings; codes are stable identifiers. */
const MESSAGES: Readonly<Record<string, string>> = {
  BAD_REQUEST: 'İstek geçersiz.',
  UNAUTHENTICATED: 'Bu işlem için giriş yapmalısınız.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok.',
  NOT_FOUND: 'Aradığınız kaynak bulunamadı.',
  METHOD_NOT_ALLOWED: 'Bu yöntem desteklenmiyor.',
  CONFLICT: 'İstek mevcut durumla çakışıyor.',
  PAYLOAD_TOO_LARGE: 'İstek gövdesi çok büyük.',
  UNSUPPORTED_MEDIA_TYPE: 'İçerik türü desteklenmiyor.',
  VALIDATION_FAILED: 'Gönderilen bilgiler doğrulanamadı.',
  RATE_LIMITED: 'Çok fazla istek gönderdiniz. Lütfen biraz bekleyin.',
  INTERNAL_ERROR: 'Beklenmeyen bir hata oluştu.',
};

function messageFor(code: string): string {
  return MESSAGES[code] ?? MESSAGES['INTERNAL_ERROR'] ?? 'Error';
}

/** Maps any thrown value to the single error body without leaking internals. */
export function mapError(error: unknown, requestId: string): MappedError {
  if (error instanceof AppError) {
    const headers: Record<string, string> =
      error instanceof RateLimitedError ? { 'Retry-After': String(error.retryAfterSeconds) } : {};
    return {
      status: error.status,
      body: { code: error.code, message: error.message, fieldErrors: [...error.fieldErrors], requestId },
      headers,
      internal: false,
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 422,
      body: {
        code: 'VALIDATION_FAILED',
        message: messageFor('VALIDATION_FAILED'),
        fieldErrors: error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
        requestId,
      },
      headers: {},
      internal: false,
    };
  }

  if (error instanceof HttpException && error.getStatus() < 500) {
    const status = error.getStatus();
    const code = STATUS_CODES[status] ?? 'BAD_REQUEST';
    return {
      status,
      body: { code, message: messageFor(code), fieldErrors: [], requestId },
      headers: {},
      internal: false,
    };
  }

  return {
    status: 500,
    body: { code: 'INTERNAL_ERROR', message: messageFor('INTERNAL_ERROR'), fieldErrors: [], requestId },
    headers: {},
    internal: true,
  };
}
