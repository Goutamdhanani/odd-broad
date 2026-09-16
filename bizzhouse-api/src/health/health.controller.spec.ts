import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let mockDataSource: any;

  const make = (queryImpl: (sql: string) => Promise<any>) => {
    mockDataSource = { query: vi.fn((sql: string) => queryImpl(sql)) };
    const c = new HealthController(mockDataSource, {
      get: vi.fn(() => 'localhost'),
    } as any);
    // never touch a real Redis in unit tests
    (c as any).getRedis = () => ({ ping: async () => 'PONG' });
    return c;
  };

  const healthyDb = async (sql: string) =>
    sql.includes('SELECT 1') ? [{}] : sql.includes('webhook_events') ? [{ stalled: '0' }] : [];

  beforeEach(() => {
    controller = make(healthyDb);
  });

  it('reports up for database, redis and an idle webhook queue', async () => {
    const res = await controller.check();
    expect(res.status).toBe('ok');
    expect(res.checks.database.status).toBe('up');
    expect(res.checks.redis.status).toBe('up');
    expect(res.checks.webhookQueue).toEqual({ status: 'up', stalledEvents: 0 });
  });

  it('flags a stalled webhook queue as warn WITHOUT failing the endpoint', async () => {
    controller = make(async (sql) => {
      if (sql.includes('SELECT 1')) return [{}];
      if (sql.includes('webhook_events')) return [{ stalled: '42' }];
      return [];
    });

    const res = await controller.check();
    // still 200-equivalent — a stall is an operator signal, not a crash
    expect(res.status).toBe('ok');
    expect(res.checks.webhookQueue).toEqual({ status: 'warn', stalledEvents: 42 });
  });

  it('503s when the database is down and skips the queue check', async () => {
    controller = make(async () => {
      throw new Error('connection refused');
    });

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
    // no point counting events when the DB itself is unreachable
    expect(mockDataSource.query).toHaveBeenCalledTimes(1);
  });

  it('503s when Redis is down even if everything else is fine', async () => {
    controller = make(healthyDb);
    (controller as any).getRedis = () => ({
      ping: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
  });

  it('warns (not fails) when the stall count query itself errors', async () => {
    controller = make(async (sql) => {
      if (sql.includes('SELECT 1')) return [{}];
      if (sql.includes('webhook_events')) throw new Error('table missing');
      return [];
    });

    const res = await controller.check();
    expect(res.status).toBe('ok');
    expect(res.checks.webhookQueue.status).toBe('warn');
    expect(res.checks.webhookQueue.error).toBe('table missing');
  });
});
