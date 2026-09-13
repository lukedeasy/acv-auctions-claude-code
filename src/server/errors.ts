import type { ApiErrorCode } from '../shared/reportTypes.ts';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  VEHICLE_NOT_FOUND: 404,
  INSPECTION_NOT_FOUND: 404,
  RUN_NOT_FOUND: 404,
  NOT_FOUND: 404,
  RUN_NOT_RETRYABLE: 409,
  ACTIVE_RUN_EXISTS: 409,
  INVALID_TRANSITION: 409,
  REPORT_NOT_READY: 409,
  NOT_IMPLEMENTED: 501,
  SIMULATED_GENERATION_FAILURE: 503,
  INTERNAL_ERROR: 500,
};

/** Typed error raised by the service layer. The HTTP layer translates it into the error envelope. */
export class ServiceError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

export function isServiceError(value: unknown): value is ServiceError {
  return value instanceof ServiceError;
}
