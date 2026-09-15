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
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { Template, TemplateStatus } from '../templates/entities/template.entity';
import { GupshupService } from '../gupshup/gupshup.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../../shared/pricing.service';
import { normalizePhone, countTemplateVariables, buildBodyComponents, fillTemplateBody } from '../../shared/phone.util';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

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
    private readonly walletService: WalletService,
    private readonly pricingService: PricingService,
  ) {}

  async sendMessage(shopId: string, dto: SendMessageDto) {
    const gupshupApp = await this.gupshupAppRepo.findOne({
      where: { shopId, wabaStatus: 'live' },
    });
    if (!gupshupApp) {
      throw new BadRequestException(
        'No active WhatsApp number found. Complete onboarding first.',
      );
    }

    // Normalize to the E.164 digit form Gupshup/Meta require (91XXXXXXXXXX)
    const waId = normalizePhone(dto.contactWaId);
    if (waId.length < 10) {
      throw new BadRequestException('contactWaId must be a valid WhatsApp number');
    }
    dto.contactWaId = waId;

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

    if (dto.type === 'text' && !sessionOpen) {
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
        if (!dto.templateComponents?.length && dto.templateValues) {
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
    // a human-readable bodyText so the UI can render filled template text.
    const providerPayload = this.buildPayload(dto);
    const storedPayload =
      dto.type === 'template' && templateRow
        ? {
            ...providerPayload,
            bodyText: fillTemplateBody(templateRow.body, dto.templateValues || []),
          }
        : providerPayload;

    const message = this.messageRepo.create({
      shopId,
      contactId: contact.id,
      direction: 'outbound' as const,
      messageType: dto.type as any,
      status: 'queued' as const,
      costPaise: costPaise,
      payload: storedPayload,
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
        this.buildPayload(dto),
      );

      const gupshupMessageId = response.messages?.[0]?.id;
      await this.messageRepo.update(savedMessage.id, {
        status: 'sent' as const,
        gupshupMessageId,
      });

      return {
        id: savedMessage.id,
        gupshupMessageId,
        status: 'sent',
        costPaise,
        contactId: contact.id,
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

    const conversations = await Promise.all(
      contacts.map(async (contact) => {
        const lastMessage = await this.messageRepo.findOne({
          where: { shopId, contactId: contact.id },
          order: { createdAt: 'DESC' },
        });

        const unreadCount = await this.messageRepo.count({
          where: {
            shopId,
            contactId: contact.id,
            direction: 'inbound' as const,
            status: 'delivered' as const,
          },
        });

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
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                direction: lastMessage.direction,
                messageType: lastMessage.messageType,
                status: lastMessage.status,
                payload: lastMessage.payload,
                createdAt: lastMessage.createdAt,
              }
            : null,
          unreadCount,
        };
      }),
    );

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

  async storeInboundMessage(
    shopId: string,
    contactId: string,
    gupshupMessageId: string,
    messageType: string,
    payload: Record<string, any>,
  ): Promise<Message> {
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
    return this.messageRepo.save(message);
  }

  async updateMessageStatus(
    gupshupMessageId: string,
    status: string,
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
    // Media types — Meta Cloud API v3 passthrough format: each media
    // object carries a `link` (publicly fetchable HTTPS URL), not `url`.
    if (!dto.mediaUrl) {
      throw new BadRequestException(`mediaUrl is required for ${dto.type} messages`);
    }
    switch (dto.type) {
      case 'image':
        return { link: dto.mediaUrl, caption: dto.caption };
      case 'video':
        return { link: dto.mediaUrl, caption: dto.caption };
      case 'document':
        return { link: dto.mediaUrl, caption: dto.caption, filename: dto.filename };
      case 'audio':
        return { link: dto.mediaUrl };
      default:
        throw new BadRequestException(`Unsupported message type: ${dto.type}`);
    }
  }
}
