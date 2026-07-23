/**
 * Application error taxonomy. Services and repositories throw these; the HTTP layer
 * (`server/core/http.ts`) maps them to safe status codes + response bodies. Keeps
 * business logic free of framework/HTTP concerns (clean architecture boundary).
 */

export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** Extra machine-readable context (never leaked to clients for 5xx). */
  readonly meta?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.meta = meta;
  }

  static validation(message = 'Invalid request', meta?: Record<string, unknown>) {
    return new AppError('VALIDATION', message, meta);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError('UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError('FORBIDDEN', message);
  }
  static notFound(message = 'Not found') {
    return new AppError('NOT_FOUND', message);
  }
  static conflict(message = 'Conflict') {
    return new AppError('CONFLICT', message);
  }
  static payloadTooLarge(message = 'Payload too large') {
    return new AppError('PAYLOAD_TOO_LARGE', message);
  }
  static unsupportedMediaType(message = 'Unsupported media type') {
    return new AppError('UNSUPPORTED_MEDIA_TYPE', message);
  }
  static rateLimited(message = 'Too many requests') {
    return new AppError('RATE_LIMITED', message);
  }
  static internal(message = 'Something went wrong') {
    return new AppError('INTERNAL', message);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
