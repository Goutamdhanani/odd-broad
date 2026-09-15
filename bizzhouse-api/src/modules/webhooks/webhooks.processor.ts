import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Contact } from '../contacts/entities/contact.entity';
import { Message } from '../messages/entities/message.entity';
import { MediaService } from '../media/media.service';
import { Shop } from '../shops/entities/shop.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { GupshupService } from '../gupshup/gupshup.service';
import { WebhookEvent } from './entities/webhook-event.entity';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/messages.gateway';
import { TemplatesService } from '../templates/templates.service';
import { AutomationService } from '../automation/automation.service';

@Processor('webhook-events')
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepo: Repository<WebhookEvent>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    private readonly messagesService: MessagesService,
    private readonly messagesGateway: MessagesGateway,
    private readonly templatesService: TemplatesService,
    private readonly gupshupService: GupshupService,
    private readonly config: ConfigService,
    private readonly automationService: AutomationService,
    private readonly mediaService: MediaService,
  ) {
    super();
  }

  async process(job: Job<{ payload: any; webhookEventId?: string; receivedAt: number }>) {
    const { payload, webhookEventId } = job.data;

    try {
      const gsAppId = payload.gs_app_id || payload.appId || payload.app_id;
      if (!gsAppId) {
        this.logger.warn('Webhook payload missing gs_app_id');
        return;
      }

      const gupshupApp = await this.gupshupAppRepo.findOne({
        where: { gupshupAppId: gsAppId },
      });
      if (!gupshupApp) {
        this.logger.warn(`No shop found for gs_app_id: ${gsAppId}`);
        return;
      }

      const shopId = gupshupApp.shopId;

      // Handle direct app events (onboarding live, status updates, template events)
      const isAppLiveEvent =
        payload.type === 'app_event' ||
        payload.event === 'app_live' ||
        payload.event === 'APP_LIVE' ||
        payload.waba_status === 'live' ||
        payload.status === 'LIVE' ||
        payload.status === 'APPROVED';

      if (isAppLiveEvent) {
        await this.handleAppLiveEvent(gupshupApp, payload);
      }

      // Template approval/rejection callbacks (Phase 40)
      if (this.isTemplateStatusEvent(payload)) {
        await this.handleTemplateStatusEvent(gupshupApp, payload);
      }

      const changes = payload.entry?.[0]?.changes?.[0]?.value;

      if (changes) {
        if (changes.messages && changes.messages.length > 0) {
          for (const msg of changes.messages) {
            await this.handleInboundMessage(shopId, msg, changes.contacts?.[0]);
          }
        }

        if (changes.statuses && changes.statuses.length > 0) {
          for (const status of changes.statuses) {
            await this.handleStatusUpdate(shopId, status);
          }
        }
      }

      if (webhookEventId) {
        // Mark exactly THIS event processed — never bulk-update, or
        // concurrent events for the same app get mislabeled.
        await this.webhookEventRepo.update(webhookEventId, { processed: true });
      } else {
        // Legacy payloads without a row id: fall back to matching the
        // oldest unprocessed row for this app (previously the norm).
        await this.webhookEventRepo.update(
          { gupshupAppId: gsAppId, processed: false },
          { processed: true },
        );
      }
    } catch (err: any) {
      this.logger.error(`Webhook processing failed: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  private async handleInboundMessage(
    shopId: string,
    msg: any,
    contactInfo?: { profile: { name: string }; wa_id: string },
  ) {
    const waId = msg.from;
    const contactName = contactInfo?.profile?.name;

    let contact = await this.contactRepo.findOne({
      where: { shopId, waId },
    });
    if (!contact) {
      contact = this.contactRepo.create({
        shopId,
        waId,
        name: contactName || undefined,
        optedIn: false,
        lastInboundAt: new Date(),
      });
      contact = await this.contactRepo.save(contact);
    } else {
      contact.lastInboundAt = new Date();
      if (contactName && !contact.name) {
        contact.name = contactName;
      }
      await this.contactRepo.save(contact);
    }

    const messagePayload: Record<string, any> = {};
    switch (msg.type) {
      case 'text':
        messagePayload.body = msg.text?.body;
        break;
      case 'button':
        // Reply to a template quick-reply button
        messagePayload.body = msg.button?.text;
        messagePayload.buttonId = msg.button?.payload;
        break;
      case 'interactive': {
        // Template/list replies arrive under interactive
        const reply = msg.interactive?.button_reply || msg.interactive?.list_reply;
        messagePayload.body = reply?.title;
        messagePayload.interactiveId = reply?.id;
        break;
      }
      case 'reaction':
        messagePayload.body = msg.reaction?.emoji;
        messagePayload.reaction = { emoji: msg.reaction?.emoji, messageId: msg.reaction?.message_id };
        break;
      case 'image':
      case 'video':
      case 'document':
      case 'audio':
      case 'sticker':
        messagePayload[msg.type] = msg[msg.type];
        // Meta media URLs expire (~24h); persist the link while it's fresh.
        // S3 re-hosting (doc §5) can replace this later.
        messagePayload.mediaUrl = msg[msg.type]?.link || msg[msg.type]?.url || msg[msg.type]?.id;
        messagePayload.mimeType = msg[msg.type]?.mime_type;
        break;
      case 'location':
        messagePayload.location = msg.location;
        break;
      case 'contacts':
        messagePayload.contactCards = msg.contacts;
        break;
      default:
        messagePayload.raw = msg;
    }

    const storedMessage = await this.messagesService.storeInboundMessage(
      shopId,
      contact.id,
      msg.id,
      msg.type || 'text',
      messagePayload,
    );

    this.messagesGateway.emitNewMessage(shopId, {
      id: storedMessage.id,
      contactId: contact.id,
      contact: { id: contact.id, waId: contact.waId, name: contact.name },
      direction: 'inbound',
      messageType: msg.type,
      status: 'delivered',
      payload: messagePayload,
      createdAt: storedMessage.createdAt,
    });

    this.logger.log(`Inbound ${msg.type} from ${waId} for shop ${shopId}`);

    // Durable media: provider URLs expire fast — re-host in object storage.
    // Fire-and-forget so webhook processing stays fast; failures keep the
    // original URL and are logged.
    if (messagePayload.mediaUrl && /^https?:\/\//i.test(String(messagePayload.mediaUrl))) {
      void this.mediaService
        .persistFromMessage(
          shopId,
          storedMessage.id,
          async (patch) => {
            await this.messageRepo.update(storedMessage.id, {
              payload: { ...messagePayload, ...patch },
            });
          },
          String(messagePayload.mediaUrl),
          undefined,
        )
        .catch(() => {});
    }

    // Automation: evaluate the shop's enabled keyword rules against the
    // inbound text. A matched rule replies through the normal send pipeline.
    const inboundText = typeof messagePayload.body === 'string' ? messagePayload.body : '';
    if (inboundText) {
      try {
        const rule = await this.automationService.matchRule(shopId, inboundText);
        if (rule) {
          await this.automationService.executeRule(rule, waId);
        }
      } catch (err: any) {
        this.logger.error(`Automation evaluation failed: ${err?.message}`);
      }
    }
  }

  private async handleStatusUpdate(shopId: string, statusUpdate: any) {
    const messageId = statusUpdate.gs_id || statusUpdate.id;
    const status = statusUpdate.status;
    if (!messageId || !status) return;

    try {
      const updatedMessage = await this.messagesService.updateMessageStatus(messageId, status);

      if (updatedMessage) {
        this.messagesGateway.emitMessageStatus(shopId, {
          messageId: updatedMessage.id,
          status,
        });
      }
    } catch (err: any) {
      // Log but don't rethrow — don't fail the entire webhook batch over one status update
      this.logger.error(
        `Failed to process status update for message ${messageId} (status: ${status}): ${err?.message}`,
        err?.stack,
      );
    }
  }

  private async handleAppLiveEvent(gupshupApp: GupshupApp, payload: any) {
    gupshupApp.wabaStatus = 'live';
    if (payload.phoneNumber || payload.phone_number) {
      gupshupApp.phoneNumber = payload.phoneNumber || payload.phone_number;
    }
    await this.gupshupAppRepo.save(gupshupApp);

    await this.shopRepo.update(gupshupApp.shopId, { status: 'active' });
    this.logger.log(
      `[WABA LIVE] Gupshup App ${gupshupApp.gupshupAppId} is live! Shop ${gupshupApp.shopId} status flipped to ACTIVE.`,
    );

    // The app token is only usable once the WABA is live — register the
    // v3 callback subscription NOW if onboarding's best-effort attempt
    // didn't succeed. Without it, Gupshup never posts inbound events.
    try {
      const alreadyLive = await this.gupshupService.hasActiveSubscription(
        gupshupApp.gupshupAppId,
      );
      if (!alreadyLive) {
        const callbackUrl = `${this.config.get<string>('gupshup.callbackBaseUrl')}/webhooks/gupshup`;
        await this.gupshupService.setSubscription(gupshupApp.gupshupAppId, callbackUrl);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to register v3 subscription for app ${gupshupApp.gupshupAppId}: ${err?.message}`,
      );
    }
  }

  /**
   * Detects template approval/rejection callbacks. Lenient on shape —
   * Gupshup/Meta have used several layouts:
   *   { type: 'template_event', templates: [{ elementName, status, reason }] }
   *   { event: 'template_status', template: { name, status, reason } }
   *   { type: 'template', status: 'APPROVED', elementName, reason }
   */
  private isTemplateStatusEvent(payload: any): boolean {
    const t = String(payload?.type || '').toLowerCase();
    const e = String(payload?.event || '').toLowerCase();
    if (t.includes('template') || e.includes('template')) return true;
    if (Array.isArray(payload?.templates)) return true;
    if (payload?.template && (payload.template.status || payload.template.template_status)) {
      return true;
    }
    return false;
  }

  private async handleTemplateStatusEvent(gupshupApp: GupshupApp, payload: any) {
    const items: any[] = Array.isArray(payload.templates)
      ? payload.templates
      : [payload.template || payload];

    for (const item of items) {
      if (!item) continue;
      const elementName =
        item.elementName || item.element_name || item.name || payload.elementName;
      const status =
        item.status || item.template_status || item.templateStatus || payload.status;
      const reason =
        item.reason || item.rejection_reason || item.rejectionReason || payload.reason;

      if (!status) continue;

      try {
        await this.templatesService.applyStatusCallback({
          gupshupAppId: gupshupApp.gupshupAppId,
          gupshupTemplateId: item.id || item.templateId || payload.templateId,
          elementName,
          status: String(status),
          rejectionReason: reason,
        });
      } catch (err: any) {
        this.logger.error(
          `Template status update failed for ${elementName}: ${err?.message}`,
        );
      }
    }
  }
}
