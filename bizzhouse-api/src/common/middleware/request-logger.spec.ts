import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { normalizeRoute, shouldSkipLog, requestLogger } from './request-logger';

describe('request-logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeRoute', () => {
    it('collapses UUID segments to :id', () => {
      expect(
        normalizeRoute('/api/messages/conversation/6467e63a-7514-4ab7-8b03-0042eeee648c'),
      ).toBe('/api/messages/conversation/:id');
    });

    it('collapses numeric segments to :id', () => {
      expect(normalizeRoute('/api/admin/shops/42/status')).toBe('/api/admin/shops/:id/status');
    });

    it('leaves static routes untouched', () => {
      expect(normalizeRoute('/api/contacts/export')).toBe('/api/contacts/export');
    });
  });

  describe('shouldSkipLog', () => {
    it('skips health probes and OPTIONS preflights', () => {
      expect(shouldSkipLog('GET', '/health')).toBe(true);
      expect(shouldSkipLog('GET', '/api/health')).toBe(true);
      expect(shouldSkipLog('OPTIONS', '/api/anything')).toBe(true);
    });

    it('logs real traffic', () => {
      expect(shouldSkipLog('POST', '/api/auth/login')).toBe(false);
    });
  });

  describe('requestLogger', () => {
    it('logs METHOD ROUTE STATUS latency on finish', () => {
      const lineSpy = vi.fn();
      vi.spyOn(Logger.prototype, 'log').mockImplementation(lineSpy);
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(lineSpy);
      vi.spyOn(Logger.prototype, 'error').mockImplementation(lineSpy);

      const finishHandlers: Array<() => void> = [];
      const req = {
        method: 'GET',
        originalUrl: '/api/contacts/6467e63a-7514-4ab7-8b03-0042eeee648c?x=1',
        on: (_e: string, cb: () => void) => finishHandlers.push(cb),
      };
      const res = {
        statusCode: 200,
        on: (_e: string, cb: () => void) => finishHandlers.push(cb),
      };
      const next = vi.fn();

      requestLogger(req as never, res as never, next);
      expect(next).toHaveBeenCalled();
      expect(finishHandlers.length).toBe(1);
      finishHandlers[0]();

      expect(lineSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^GET \/api\/contacts\/:id 200 \d+ms$/),
      );
    });

    it('passes health probes straight through', () => {
      const next = vi.fn();
      const req = {
        method: 'GET',
        originalUrl: '/health',
        on: vi.fn(),
      };
      requestLogger(req as never, { statusCode: 200, on: vi.fn() } as never, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
