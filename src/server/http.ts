import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiErrorBody } from '../shared/reportTypes.ts';
import { ServiceError, isServiceError } from './errors.ts';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Validate a path identifier. IDs are opaque strings; this only rejects unsafe or empty values. */
export function requireIdParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ServiceError('INVALID_REQUEST', `Path parameter ${name} is invalid.`);
  }
  return value;
}

/** Require a JSON object body. Empty objects are valid. Arrays, primitives and missing bodies are rejected. */
export function requireObjectBody(req: Request): Record<string, unknown> {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ServiceError('INVALID_REQUEST', 'Request body must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

/** Wrap an async handler so rejections reach the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function errorBody(code: ApiErrorBody['error']['code'], message: string): ApiErrorBody {
  return { error: { code, message } };
}

/** Translate errors into the JSON envelope. Stack traces never reach the client. */
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (isServiceError(err)) {
    res.status(err.status).json(errorBody(err.code, err.message));
    return;
  }
  const maybe = err as { type?: string; status?: number };
  if (maybe && (maybe.type === 'entity.parse.failed' || maybe.status === 400)) {
    res.status(400).json(errorBody('INVALID_REQUEST', 'Request body must be valid JSON.'));
    return;
  }
  console.error('[inspection-desk] unexpected error', err);
  res.status(500).json(errorBody('INTERNAL_ERROR', 'Unexpected server error.'));
}
