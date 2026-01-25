import { Request, Response, NextFunction } from 'express';
import { createServerLogger } from '@ai-tel-mook/shared';

const logger = createServerLogger('gateway:error');

export interface ApiError {
  error: true;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp: string;
}

export class HttpError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.name = 'HttpError';
  }
}

export function errorHandler(
  err: Error | HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  // Determine status code
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An internal error occurred';
  let details: unknown;

  if (err instanceof HttpError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === 'SyntaxError') {
    // JSON parsing error
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (err.name === 'ValidationError' || err.name === 'ZodError') {
    // Validation error
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = err.message;
    details = (err as { errors?: unknown }).errors;
  } else {
    message = err.message || message;
  }

  // Log the error
  logger.error(`[${requestId}] ${code}: ${message}`, {
    error: err.message,
    stack: err.stack,
    statusCode,
    code,
  });

  // Build error response
  const errorResponse: ApiError = {
    error: true,
    code,
    message,
    timestamp: new Date().toISOString(),
  };

  if (details) {
    errorResponse.details = details;
  }

  if (requestId) {
    errorResponse.requestId = requestId;
  }

  res.status(statusCode).json(errorResponse);
}

// 404 handler
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  const errorResponse: ApiError = {
    error: true,
    code: 'NOT_FOUND',
    message: `Route not found: ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  };

  if (requestId) {
    errorResponse.requestId = requestId;
  }

  res.status(404).json(errorResponse);
}
