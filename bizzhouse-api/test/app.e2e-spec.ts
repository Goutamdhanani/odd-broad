import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from './../src/health/health.controller.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['webhooks/gupshup', 'health'],
    });
    await app.init();
  });

  it('/health (GET) returns 200 OK', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.service).toBe('bizzhouse-api');
      });
  });

  it('/api/health (GET) returns 404 (health is prefix-excluded)', () => {
    return request(app.getHttpServer()).get('/api/health').expect(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
