import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Template, TemplateStatus, TemplateType } from '../templates/entities/template.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { GupshupService } from '../gupshup/gupshup.service';
import { NumberHealthService } from '../gupshup/number-health.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../../shared/pricing.service';
import { normalizePhone, countTemplateVariables, buildBodyComponents, fillTemplateBody } from '../../shared/phone.util';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  /** Free-form message types bound by Meta's 24-hour session window. */
  private static readonly MEDIA_SESSION_TYPES = ['image', 'video', 'document', 'audio'];

  constructor(
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly gupshupService: GupshupService,
    private readonly numberHealthService: NumberHealthService,
    private readonly walletService: WalletService,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * Send one message. The sending number is either the shop's pinned
   * gupshupAppId or the health-aware router's pick (spec §2.4). Template
   * payloads are built in Meta's exact Cloud API shape, including the
   * carousel component for CAROUSEL templates (spec §3.4).
   */
  async sendMessage(shopId: string, dto: SendMessageDto) {
    // Normalize to the E.164 digit form Gupshup/Meta require (91XXXXXXXXXX)
    const waId = normalizePhone(dto.contactWaId);
    if (waId.length < 10) {
      throw new BadRequestException('contactWaId must be a valid WhatsApp number');
    }
    dto.contactWaId = waId;

    // Route to a sending number (spec §2.4) — honors a pinned app, else
    // picks the healthy number furthest from its daily tier ceiling.
    let gupshupApp: GupshupApp;
    try {
      gupshupApp = await this.numberHealthService.pickSendingNumber(shopId, dto.gupshupAppId);
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'No active WhatsApp number found');
    }

    let contact = await this.contactRepo.findOne({
      where: { shopId, waId },
    });
    if (!contact) {
      contact = this.contactRepo.create({
        shopId,
        waId,
        name: dto.contactName || undefined,
        optedIn: false,
      });
      contact = await this.contactRepo.save(contact);
    }

    // ─── 24-hour session window (Phase 49) ─────────────
    // Free-form text is only allowed within 24h of the contact's last
    // inbound message (Meta rule). Outside the window, shops must use
    // an approved template.
    const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
    const lastInbound = contact.lastInboundAt
      ? new Date(contact.lastInboundAt).getTime()
      : 0;
    const sessionOpen = Date.now() - lastInbound < SESSION_WINDOW_MS;

    if (
      (dto.type === 'text' || MessagesService.MEDIA_SESSION_TYPES.includes(dto.type)) &&
      !sessionOpen
    ) {
      throw new BadRequestException(
        'The 24-hour session window is closed for this contact. Use an approved template to reach them.',
      );
    }

    // ─── Opt-in enforcement (Meta policy, doc §11) ──────
    // Template messages outside the session window are marketing-style
    // contact: the customer must have opted in, or Meta can restrict
    // the shop's number. Inside an open session, replies are fine.
    if (dto.type === 'template' && !sessionOpen && !contact.optedIn) {
      throw new BadRequestException(
        'This contact has not opted in to marketing messages (Meta policy). Import them with opt-in recorded or ask them to message you first.',
      );
    }

    // Price by the template's real category, not a hardcoded one.
    let category: 'marketing' | 'utility' | 'authentication' | 'service' =
      'service';
    let templateRow: Template | null = null;
    if (dto.type === 'template') {
      const template = await this.templateRepo.findOne({
        where: { shopId, elementName: dto.templateName },
      });
      templateRow = template;
      if (template && template.status === TemplateStatus.APPROVED) {
        category = template.category.toLowerCase() as any;

        // Build body components from positional values when the caller
        // supplied them instead of raw components — Meta rejects template
        // sends whose {{N}} placeholders are not all filled.
        if (template.templateType === TemplateType.CAROUSEL) {
          // Carousel: body + per-card components (spec §3.4). Media is
          // always sent by mediaId — cards were uploaded at creation.
          dto.templateComponents = this.buildCarouselComponents(
            template,
            dto.templateValues || [],
          );
        } else if (
          !dto.templateComponents?.length &&
          dto.templateValues
        ) {
          const needed = countTemplateVariables(template.body);
          if (dto.templateValues.length !== needed) {
            throw new BadRequestException(
              `Template '${template.elementName}' has ${needed} variable(s); ${dto.templateValues.length} value(s) supplied.`,
            );
          }
          dto.templateComponents = buildBodyComponents(dto.templateValues);
        }
      } else if (template) {
        throw new BadRequestException(
          `Template '${template.elementName}' is ${template.status}, only APPROVED templates can be sent.`,
        );
      } else {
        category = 'marketing';
      }
    }
    const costPaise = this.pricingService.getCost(category, 'IN');

    // Provider payload stays exactly in Meta's shape; the stored copy gains
    // a human-readable bodyText (templates) or the durable preview URL
    // (media) so the UI can render it forever.
    const providerPayload = this.buildPayload(dto);
    const storedPayload: Record<string, any> = { ...providerPayload };
    if (dto.type === 'template' && templateRow) {
      storedPayload.bodyText = fillTemplateBody(templateRow.body, dto.templateValues || []);
    }
    if (dto.mediaPreviewUrl) {
      storedPayload.mediaUrl = dto.mediaPreviewUrl;
      if (dto.filename) storedPayload.filename = dto.filename;
    }

    const message = this.messageRepo.create({
      shopId,
      contactId: contact.id,
      direction: 'outbound' as const,
      messageType: dto.type as any,
      status: 'queued' as const,
      costPaise: costPaise,
      payload: storedPayload,
      gupshupAppId: gupshupApp.gupshupAppId,
      broadcastId: dto.broadcastId || null,
    });
    const savedMessage = await this.messageRepo.save(message);

    if (costPaise > 0) {
      const debitResult = await this.walletService.debitForMessage(
        shopId,
        costPaise,
        savedMessage.id,
      );
      if (!debitResult.success) {
        await this.messageRepo.update(savedMessage.id, { status: 'failed' as const });
        throw new BadRequestException(
          'Insufficient wallet balance. Please top up your wallet.',
        );
      }
    }

    try {
      const response = await this.gupshupService.sendMessage(
        gupshupApp.gupshupAppId,
        dto.contactWaId,
        dto.type,
        providerPayload,
      );

      const gupshupMessageId = response.messages?.[0]?.id || (response as any).messageId;
      await this.messageRepo.update(savedMessage.id, {
        status: 'sent' as const,
        gupshupMessageId: gupshupMessageId || null,
      });

      return {
        id: savedMessage.id,
        gupshupMessageId,
        status: 'sent',
        costPaise,
        contactId: contact.id,
        sentVia: gupshupApp.gupshupAppId,
      };
    } catch (err: any) {
      if (costPaise > 0) {
        await this.walletService.refundForMessage(shopId, costPaise, savedMessage.id);
      }
      await this.messageRepo.update(savedMessage.id, { status: 'failed' as const });
      this.logger.error(`Send failed for shop ${shopId}: ${err?.message}`);
      throw new BadRequestException(`Failed to send message: ${err?.message}`);
    }
  }

  /**
   * Build the Meta carousel component block from the template's stored
   * card structure (spec §3.4 — "build this by reading the card structure
   * back from your synced template row, not by hand-guessing").
   * Card bodies may carry {{N}} placeholders that continue the main body's
   * numbering; positional dto.templateValues fill them in order.
   */
  private buildCarouselComponents(template: Template, values: string[]) {
    const components: any[] = [];

    // Main body parameters ({{1}}..{{n}} of the template body)
    const bodyVarCount = countTemplateVariables(template.body);
    if (bodyVarCount > 0) {
      components.push(buildBodyComponents(values.slice(0, bodyVarCount))[0]);
    }

    // Per-card components in card order
    const cards = template.cards || [];
    const cardComponents = cards.map((card, cardIndex) => {
      const cardComps: any[] = [];

      if (card.mediaId) {
        cardComps.push({
          type: 'header',
          parameters: [
            card.headerType === 'VIDEO'
              ? { type: 'video', video: { id: card.mediaId } }
              : { type: 'image', image: { id: card.mediaId } },
          ],
        });
      }

      const cardVars = countTemplateVariables(card.body || '');
      if (cardVars > 0) {
        const start = bodyVarCount + cards.slice(0, cardIndex).reduce(
          (sum, c) => sum + countTemplateVariables(c.body || ''), 0,
        );
        cardComps.push({
          type: 'body',
          parameters: values.slice(start, start + cardVars).map((v) => ({ type: 'text', text: String(v) })),
        });
      }

      const urlButton = (card.buttons || []).find((b) => b.type === 'URL' && /{{1}}/.test(b.url || ''));
      if (urlButton) {
        const start = bodyVarCount + cards.slice(0, cardIndex).reduce(
          (sum, c) => sum + countTemplateVariables(c.body || ''), 0,
        ) + cardVars;
        cardComps.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: values[start] || '' }],
        });
      }

      return { components: cardComps };
    });

    components.push({ type: 'carousel', cards: cardComponents });
    return components;
  }

  async getConversations(
    shopId: string,
    page = 1,
    limit = 30,
    assignedToUserId?: string,
  ) {
    const where: Record<string, unknown> = { shopId };
    if (assignedToUserId) where.assignedUserId = assignedToUserId;

    const contacts = await this.contactRepo.find({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Batched instead of 2 queries per contact (was an N+1 on the hottest
    // screen): DISTINCT ON picks the newest message per thread, GROUP BY
    // counts unreads. Three fixed round-trips per page, any size.
    const contactIds = contacts.map((c) => c.id);

    const [lastRows, unreadRows] = contactIds.length
      ? await Promise.all([
          this.messageRepo.query(
            `SELECT DISTINCT ON (m.contact_id)
               m.id, m.direction, m.message_type, m.status, m.payload, m.created_at, m.contact_id
             FROM messages m
             WHERE m.shop_id = $1 AND m.contact_id = ANY($2::uuid[])
             ORDER BY m.contact_id, m.created_at DESC`,
            [shopId, contactIds],
          ),
          this.messageRepo.query(
            `SELECT contact_id, COUNT(*)::int AS unread
             FROM messages
             WHERE shop_id = $1 AND contact_id = ANY($2::uuid[])
               AND direction = 'inbound' AND status = 'delivered'
             GROUP BY contact_id`,
            [shopId, contactIds],
          ),
        ])
      : [[], []];

    const lastByContact = new Map<string, any>(
      (lastRows as any[]).map((r) => [String(r.contact_id), r]),
    );
    const unreadByContact = new Map<string, number>(
      (unreadRows as any[]).map((r) => [String(r.contact_id), Number(r.unread)]),
    );

    const conversations = contacts.map((contact) => {
      const last = lastByContact.get(String(contact.id));
      const inSessionWindow =
        !!contact.lastInboundAt &&
        Date.now() - new Date(contact.lastInboundAt).getTime() < 24 * 60 * 60 * 1000;

      return {
        contact: {
          id: contact.id,
          waId: contact.waId,
          name: contact.name,
          optedIn: contact.optedIn,
          tags: contact.tags,
          sessionOpen: inSessionWindow,
          assignedUserId: contact.assignedUserId ?? null,
        },
        lastMessage: last
          ? {
              id: last.id,
              direction: last.direction,
              messageType: last.message_type,
              status: last.status,
              payload: last.payload,
              createdAt: last.created_at,
            }
          : null,
        unreadCount: unreadByContact.get(String(contact.id)) ?? 0,
      };
    });

    conversations.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    return { data: conversations, page, limit };
  }

  async getConversationMessages(
    shopId: string,
    contactId: string,
    page = 1,
    limit = 50,
  ) {
    const contact = await this.contactRepo.findOne({
      where: { id: contactId, shopId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { shopId, contactId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      contact: { id: contact.id, waId: contact.waId, name: contact.name },
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        messageType: m.messageType,
        gupshupMessageId: m.gupshupMessageId,
        status: m.status,
        costPaise: m.costPaise ? Number(m.costPaise) : null,
        payload: m.payload,
        createdAt: m.createdAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Assign/unassign a conversation (contact thread) to a team member.
   * The assignee must belong to the same shop; null clears the assignment.
   */
  async assignConversation(
    shopId: string,
    contactId: string,
    assignedUserId: string | null,
    shopUserIds: Set<string>,
  ): Promise<{ id: string; assignedUserId: string | null }> {
    const contact = await this.contactRepo.findOne({ where: { id: contactId, shopId } });
    if (!contact) throw new NotFoundException('Contact not found');

    if (assignedUserId && !shopUserIds.has(assignedUserId)) {
      throw new BadRequestException('Assignee must be a member of this shop');
    }
    contact.assignedUserId = assignedUserId;
    const saved = await this.contactRepo.save(contact);
    return { id: saved.id, assignedUserId: saved.assignedUserId ?? null };
  }

  /**
   * Persist an inbound webhook message — idempotent. Gupshup retries
   * un-acked deliveries (and admins can replay events), so the same wamid
   * can arrive twice; a second copy must NOT show up as a duplicate chat
   * bubble. Check-first, with the partial unique index (migration
   * 1789600000000) as the concurrent-retry backstop.
   */
  async storeInboundMessage(
    shopId: string,
    contactId: string,
    gupshupMessageId: string,
    messageType: string,
    payload: Record<string, any>,
  ): Promise<Message> {
    const existing = await this.messageRepo.findOne({
      where: { gupshupMessageId },
    });
    if (existing) {
      this.logger.log(`Duplicate inbound event for ${gupshupMessageId} — skipped`);
      return existing;
    }

    const message = this.messageRepo.create({
      shopId,
      contactId,
      direction: 'inbound' as const,
      messageType: messageType as any,
      gupshupMessageId,
      status: 'delivered' as const,
      costPaise: 0,
      payload,
    });
    try {
      return await this.messageRepo.save(message);
    } catch (err: any) {
      // Lost a race against a concurrent retry — return the winner's row.
      if (err?.code === '23505') {
        const winner = await this.messageRepo.findOne({ where: { gupshupMessageId } });
        if (winner) {
          this.logger.log(`Concurrent duplicate for ${gupshupMessageId} — deduped via unique index`);
          return winner;
        }
      }
      throw err;
    }
  }

  /**
   * Apply a provider status update. `failure` carries the webhook's
   * errors[0] (Meta error code + human title) so the shop sees WHY a
   * message failed, not just that it did.
   */
  async updateMessageStatus(
    gupshupMessageId: string,
    status: string,
    failure?: { code?: number; title?: string },
  ): Promise<Message | null> {
    const message = await this.messageRepo.findOne({
      where: { gupshupMessageId },
    });
    if (!message) {
      this.logger.warn(`Status update for unknown message: ${gupshupMessageId}`);
      return null;
    }

    // Terminal state: if already failed, ignore further updates
    if (message.status === 'failed') {
      return message;
    }

    const statusOrder = ['queued', 'sent', 'delivered', 'read'];
    const currentIndex = statusOrder.indexOf(message.status);
    const newIndex = statusOrder.indexOf(status);

    if (status === 'failed') {
      message.status = 'failed';
      if (failure?.code || failure?.title) {
        message.payload = {
          ...message.payload,
          failureReason: {
            code: failure.code ?? null,
            title: failure.title ?? '',
          },
        };
      }
      await this.messageRepo.save(message);

      if (message.costPaise && Number(message.costPaise) > 0) {
        await this.walletService.refundForMessage(
          message.shopId,
          Number(message.costPaise),
          message.id,
        );
      }
      return message;
    }

    // Normal forward progression (e.g. queued -> sent -> delivered -> read)
    if (newIndex > currentIndex) {
      message.status = status as any;
      await this.messageRepo.save(message);
    }

    return message;
  }

  private buildPayload(dto: SendMessageDto): Record<string, any> {
    if (dto.type === 'text') {
      if (!dto.text?.trim()) {
        throw new BadRequestException('text is required for text messages');
      }
      return { body: dto.text };
    }
    if (dto.type === 'template') {
      if (!dto.templateName) {
        throw new BadRequestException('templateName is required for template messages');
      }
      return {
        name: dto.templateName,
        language: { code: dto.templateLanguage || 'en' },
        components: dto.templateComponents || [],
      };
    }
    // Media types — Meta Cloud API v3 passthrough format. An uploaded
    // mediaId (POST /media/upload) is preferred; a public HTTPS `link` is
    // the fallback. The internal preview URL is never sent upstream.
    if (dto.type === 'image' || dto.type === 'video' || dto.type === 'document' || dto.type === 'audio') {
      if (!dto.mediaId && !dto.mediaUrl) {
        throw new BadRequestException(`mediaId or mediaUrl is required for ${dto.type} messages`);
      }
      const media = dto.mediaId ? { id: dto.mediaId } : { link: dto.mediaUrl };
      switch (dto.type) {
        case 'image':
          return { ...media, caption: dto.caption };
        case 'video':
          return { ...media, caption: dto.caption };
        case 'document':
          return { ...media, caption: dto.caption, filename: dto.filename };
        case 'audio':
          return media;
      }
    }
    throw new BadRequestException(`Unsupported message type: ${dto.type}`);
  }
}
