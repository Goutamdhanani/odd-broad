import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rate_limit';
export interface RateLimitOptions {
  /** Max requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/**
 * Metadata decorator for the RateLimitGuard.
 * @SetMetadata(RATE_LIMIT_KEY, { limit: 5, windowMs: 60_000 })
 */
export const RateLimit = (limit: number, windowMs: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs } satisfies RateLimitOptions);

interface Bucket {
  hits: number[];
}

/**
 * Dependency-free in-memory sliding-window rate limiter.
 *
 * Applied to auth endpoints to slow down credential stuffing and
 * brute-force login attempts. Per-instance state: acceptable for the
 * small horizontal scale this platform runs at (an attacker must spread
 * attempts across every replica, not just one). A Redis-backed limiter
 * can replace the Map later without changing call sites.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private static readonly buckets = new Map<string, Bucket>();
  private static lastSweep = Date.now();

  // Generous default; auth endpoints override with @RateLimit()
  private static readonly DEFAULT: RateLimitOptions = { limit: 60, windowMs: 60_000 };

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || RateLimitGuard.DEFAULT;

    const request = context.switchToHttp().getRequest();
    const routeKey = `${request.method}:${request.route?.path || request.url}`;
    const ip =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown';
    const key = `${ip}|${routeKey}`;

    RateLimitGuard.sweepIfNeeded();

    const now = Date.now();
    const bucket = RateLimitGuard.buckets.get(key) || { hits: [] };
    bucket.hits = bucket.hits.filter((t) => now - t < options.windowMs);

    if (bucket.hits.length >= options.limit) {
      const retryAfterSec = Math.ceil(
        (options.windowMs - (now - bucket.hits[0])) / 1000,
      );
      throw new HttpException(
        `Too many requests. Try again in ${retryAfterSec}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.hits.push(now);
    RateLimitGuard.buckets.set(key, bucket);
    return true;
  }

  /** Occasional O(n) sweep so abandoned buckets don't grow unbounded. */
  private static sweepIfNeeded() {
    const now = Date.now();
    if (now - RateLimitGuard.lastSweep < 300_000) return; // every 5 min
    RateLimitGuard.lastSweep = now;
    for (const [key, bucket] of RateLimitGuard.buckets) {
      const newest = bucket.hits[bucket.hits.length - 1] || 0;
      if (now - newest > 600_000) {
        RateLimitGuard.buckets.delete(key);
      }
    }
  }
}
