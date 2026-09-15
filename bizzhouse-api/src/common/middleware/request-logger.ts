import { Logger } from '@nestjs/common';

const logger = new Logger('HTTP');
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Collapse high-cardinality path segments (resource UUIDs / ids) to :id so
 * logs group by route instead of by every row, and identifiers don't leak
 * into log lines in bulk.
 */
export function normalizeRoute(rawPath: string): string {
  return rawPath.replace(UUID_RE, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');
}

/** Requests that would only spam the log (health probes, OPTIONS preflights). */
export function shouldSkipLog(method: string | undefined, path: string): boolean {
  return method === 'OPTIONS' || path === '/health' || path === '/api/health';
}

/**
 * Express middleware: one line per finished request
 *   METHOD normalized-route STATUS latencyMs
 * Latency is measured from arrival to response finish (not just handler
 * return), so it reflects what the client actually experiences. 4xx+ at
 * warn level, slow requests (>1s) flagged, everything else info.
 */
export function requestLogger(
  req: {
    method: string;
    originalUrl: string;
    headers?: Record<string, unknown>;
    on?: (event: string, cb: () => void) => void;
  },
  res: { statusCode: number; on?: (event: string, cb: () => void) => void },
  next: () => void,
): void {
  const path = (req.originalUrl || '').split('?')[0];
  if (shouldSkipLog(req.method, path)) return next();

  const startedAt = Date.now();
  res.on?.('finish', () => {
    const ms = Date.now() - startedAt;
    const line = `${req.method} ${normalizeRoute(path)} ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) logger.error(line);
    else if (res.statusCode >= 400) logger.warn(line);
    else if (ms > 1000) logger.warn(`[slow] ${line}`);
    else logger.log(line);
  });
  next();
}
