import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WebhookEvent } from './entities/webhook-event.entity';
import { Request } from 'express';

/**
 * Ultra-fast webhook receiver.
 * Its ONLY job: ack immediately, dump raw payload to queue + DB.
 * All real processing happens in WebhooksProcessor.
 *
 * Per Gupshup: respond 2xx within 10 seconds or it's retried.
 * Our target: < 100ms.
 */
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    @InjectQueue('webhook-events')
    private readonly webhookQueue: Queue,
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepo: Repository<WebhookEvent>,
    private readonly config: ConfigService,
  ) {}

  @Post('gupshup')
  @HttpCode(HttpStatus.OK)
  async receiveGupshupWebhook(@Body() payload: any, @Req() req: Request) {
    // Shared-secret verification: Gupshup echoes the secret we registered
    // in the subscription's `meta` back as X-Gupshup-Webhook-Secret.
    // Enforced whenever GUPSHUP_WEBHOOK_SECRET is configured.
    const secret = this.config.get<string>('gupshup.webhookSecret');
    if (secret) {
      const received = (req.headers['x-gupshup-webhook-secret'] as string) || '';
      if (received !== secret) {
        this.logger.warn('Gupshup webhook rejected: invalid or missing X-Gupshup-Webhook-Secret');
        throw new ForbiddenException('Forbidden');
      }
    }

    // Optional IP allowlist — enforced only when WEBHOOK_IP_WHITELIST is set,
    // so local/dev traffic flows freely but production can lock to Gupshup.
    const whitelist = this.config.get<string[]>('webhook.ipWhitelist') || [];
    if (whitelist.length > 0) {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      if (!clientIp || !whitelist.includes(clientIp)) {
        this.logger.warn(`Webhook rejected from non-whitelisted IP: ${clientIp}`);
        throw new ForbiddenException('Forbidden');
      }
    }

    // Fire-and-forget: don't await these — ack first
    const gsAppId = payload?.gs_app_id || null;
    const eventType = this.detectEventType(payload);

    // Store the raw event, then enqueue processing tied to the stored row
    // (both non-blocking — the ack below is what Gupshup sees, fast).
    this.webhookEventRepo
      .save({
        gupshupAppId: gsAppId,
        eventType,
        rawPayload: payload,
        processed: false,
      })
      .then((saved) =>
        this.webhookQueue.add(
          'process',
          { payload, webhookEventId: saved.id, receivedAt: Date.now() },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        ),
      )
      .catch((err) =>
        this.logger.error(`Failed to store/enqueue webhook event: ${err.message}`),
      );

    // Return empty body immediately — this is what Gupshup expects
    return '';
  }

  private detectEventType(payload: any): string {
    try {
      const changes = payload?.entry?.[0]?.changes?.[0]?.value;
      if (changes?.messages) return 'message';
      if (changes?.statuses) return 'status';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }
}
