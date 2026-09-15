import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  private redis: Redis | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // PostgreSQL — a real round-trip, not just "app is up"
    const dbStart = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = { status: 'up', latencyMs: Date.now() - dbStart };
    } catch (err: any) {
      checks.database = { status: 'down', error: err?.message };
    }

    // Redis — the queues depend on it; a dead Redis means webhooks
    // pile up unprocessed even though the API still answers 200.
    const redisStart = Date.now();
    try {
      const pong = await this.getRedis().ping();
      checks.redis = {
        status: pong === 'PONG' ? 'up' : 'down',
        latencyMs: Date.now() - redisStart,
      };
    } catch (err: any) {
      checks.redis = { status: 'down', error: err?.message };
    }

    const healthy = Object.values(checks).every((c) => c.status === 'up');

    if (!healthy) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'bizzhouse-api',
        checks,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      });
    }

    return {
      status: 'ok',
      service: 'bizzhouse-api',
      checks,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }

  /** Lazily-created shared probe connection (never used for app data). */
  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        host: this.config.get<string>('redis.host'),
        port: this.config.get<number>('redis.port'),
        maxRetriesPerRequest: 1,
      });
    }
    return this.redis;
  }
}
