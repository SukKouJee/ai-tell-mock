import { Request, Response, NextFunction } from 'express';
import { createServerLogger } from '@ai-tel-mook/shared';

const logger = createServerLogger('gateway:http');

export interface RequestLog {
  method: string;
  path: string;
  query: Record<string, unknown>;
  body?: unknown;
  timestamp: string;
  requestId: string;
}

export interface ResponseLog {
  requestId: string;
  statusCode: number;
  duration: number;
  timestamp: string;
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Attach requestId to request for later use
  (req as Request & { requestId: string }).requestId = requestId;

  // Log incoming request
  const requestLog: RequestLog = {
    method: req.method,
    path: req.path,
    query: req.query as Record<string, unknown>,
    timestamp: new Date().toISOString(),
    requestId,
  };

  // Only log body for POST/PUT/PATCH
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    requestLog.body = sanitizeBody(req.body);
  }

  logger.info(`[${requestId}] ${req.method} ${req.path}`, requestLog);

  // Capture response finish event
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const responseLog: ResponseLog = {
      requestId,
      statusCode: res.statusCode,
      duration,
      timestamp: new Date().toISOString(),
    };

    const level = res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`[${requestId}] ${res.statusCode} ${duration}ms`, responseLog);
  });

  next();
}

// Sanitize body to avoid logging sensitive data
function sanitizeBody(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) {
    return body;
  }

  const sanitized = { ...body as Record<string, unknown> };
  const sensitiveFields = ['password', 'secret', 'token', 'apiKey', 'api_key'];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}
