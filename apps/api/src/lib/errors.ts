import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import type { ApiErrorBody } from '@busbuddy/shared';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have permission to do that.') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found.`);
export const conflict = (message: string) => new HttpError(409, 'conflict', message);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(
      400,
      'validation_error',
      'Some fields are invalid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = { error: { code: 'not_found', message: 'Endpoint not found.' } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = { error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } };
  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = { error: { code: 'validation_error', message: 'Some fields are invalid.', details: err.issues } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    status = 409;
    body = { error: { code: 'conflict', message: 'A record with these details already exists.' } };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    status = 404;
    body = { error: { code: 'not_found', message: 'Resource not found.' } };
  } else if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'bad_request', message: 'Request body is not valid JSON.' } };
  } else if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
    status = 413;
    body = { error: { code: 'payload_too_large', message: 'Request body is too large.' } };
  }
  if (status >= 500) logger.error('Unhandled error', { method: req.method, path: req.path, error: err instanceof Error ? err.stack : String(err) });
  res.status(status).json(body);
};
