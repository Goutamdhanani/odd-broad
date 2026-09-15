import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { requestLogger } from './common/middleware/request-logger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  validateProductionConfig(logger);
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('port') || 3001;
  const frontendUrl = config.get<string>('frontendUrl') || 'http://localhost:3000';

  // ─── Security ────────────────────────────────────
  app.use(helmet());

  // ─── Observability: one log line per finished request ──
  app.use(requestLogger);

  const allowedOrigins = [
    frontendUrl,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || config.get<string>('nodeEnv') === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ─── Global pipes & filters ──────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TenantContextInterceptor());

  // ─── API prefix ──────────────────────────────────
  app.setGlobalPrefix('api', {
    exclude: ['webhooks/gupshup', 'webhooks/razorpay', 'health'], // Webhook + health probes at root path
  });

  await app.listen(port);
  logger.log(`🚀 BizzHouse API running on http://localhost:${port}`);
  logger.log(`📡 Webhook endpoint: http://localhost:${port}/webhooks/gupshup`);
  logger.log(`🌐 CORS origin: ${frontendUrl}`);
}

/**
 * Refuse to boot a production API with placeholder credentials.
 * Dev environments (mock modes on) are free to run with defaults.
 */
function validateProductionConfig(logger: Logger) {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) return;

  const errors: string[] = [];

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('change-me')) {
    errors.push('JWT_SECRET must be set to a random 64+ character string (never the dev default).');
  }

  if (process.env.GUPSHUP_MOCK_MODE !== 'true') {
    if (!process.env.GUPSHUP_EMAIL || !process.env.GUPSHUP_CLIENT_SECRET) {
      errors.push('GUPSHUP_MOCK_MODE is off but GUPSHUP_EMAIL / GUPSHUP_CLIENT_SECRET are not set.');
    }
  }

  if (process.env.RAZORPAY_MOCK_MODE !== 'true') {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      errors.push('RAZORPAY_MOCK_MODE is off but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.');
    }
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      errors.push('RAZORPAY_WEBHOOK_SECRET is required in live mode — webhook credits are rejected without it.');
    }
  }

  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || '';
  if (adminPassword && (adminPassword === 'password@123' || adminPassword === 'Admin@BizzHouse2026')) {
    logger.warn('DEFAULT_ADMIN_PASSWORD is still a shipped default — rotate it before going live.');
  }

  if (errors.length > 0) {
    for (const e of errors) logger.error(`CONFIG: ${e}`);
    throw new Error(
      `Refusing to start in production with invalid configuration:\n- ${errors.join('\n- ')}`,
    );
  }
}

bootstrap();
