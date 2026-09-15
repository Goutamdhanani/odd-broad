import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Broadcast, BroadcastStatus } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Message } from '../messages/entities/message.entity';
import { Template, TemplateStatus, TemplateType } from '../templates/entities/template.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { NumberHealthService } from '../gupshup/number-health.service';
import { WalletService } from '../wallet/wallet.service';
import { PricingService } from '../../shared/pricing.service';
import { countTemplateVariables, buildBodyComponents } from '../../shared/phone.util';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);

  constructor(
    @InjectRepository(Broadcast)
    private readonly broadcastRepo: Repository<Broadcast>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly numberHealthService: NumberHealthService,
    private readonly walletService: WalletService,
    private readonly pricingService: PricingService,
    @InjectQueue('broadcast-dispatch')
    private readonly broadcastQueue: Queue,
  ) {}

  /**
   * Validate a template broadcast request and queue it for dispatch.
   * Only APPROVED templates can be broadcast, only to opted-in contacts,
   * and the wallet must cover the estimated cost up front.
   */
  async create(shopId: string, dto: CreateBroadcastDto) {
    const template = await this.templateRepo.findOne({
      where: { shopId, elementName: dto.templateName },
    });
    if (!template) {
      throw new NotFoundException(
        `Template '${dto.templateName}' not found. Create and approve it first.`,
      );
    }
    if (template.status !== TemplateStatus.APPROVED) {
      throw new BadRequestException(
        `Template '${dto.templateName}' is ${template.status}, only APPROVED templates can be broadcast.`,
      );
    }

    const { count: recipientCount } = await this.countAudience(shopId, dto.audienceTag);
    if (recipientCount === 0) {
      throw new BadRequestException(
        'No opted-in contacts match this audience. Broadcasts can only target opted-in contacts.',
      );
    }

    const unitCostPaise = this.pricingService.getCost(
      template.category.toLowerCase() as any,
      'IN',
    );
    const estimatedCostPaise = unitCostPaise * recipientCount;

    const balance = await this.walletService.getBalance(shopId);
    if (balance < estimatedCostPaise) {
      throw new BadRequestException(
        `Insufficient wallet balance: estimated cost is ₹${(estimatedCostPaise / 100).toFixed(2)} ` +
        `for ${recipientCount} recipients but balance is ₹${(balance / 100).toFixed(2)}. Top up and retry.`,
      );
    }

    // Resolve final Meta components up front: explicit components win,
    // otherwise positional bodyVariables are built against the template's
    // {{N}} placeholders (Meta rejects sends with unfilled variables).
    // Carousel templates are the exception: components are rebuilt per
    // send from the template's card structure (spec §3.4).
    let components = dto.templateComponents || [];
    const variablesInBody = countTemplateVariables(template.body);
    if (template.templateType === TemplateType.CAROUSEL) {
      if (variablesInBody > 0 && (dto.bodyVariables?.length ?? 0) !== variablesInBody) {
        throw new BadRequestException(
          `Carousel template '${template.elementName}' has ${variablesInBody} variable(s) across its body/cards; provide a value for each.`,
        );
      }
      components = [];
    } else if (components.length === 0 && dto.bodyVariables?.length) {
      if (dto.bodyVariables.length !== variablesInBody) {
        throw new BadRequestException(
          `Template '${template.elementName}' has ${variablesInBody} variable(s); ${dto.bodyVariables.length} value(s) supplied.`,
        );
      }
      components = buildBodyComponents(dto.bodyVariables);
    } else if (components.length === 0 && variablesInBody > 0) {
      throw new BadRequestException(
        `Template '${template.elementName}' has ${variablesInBody} variable(s). Provide a value for each before broadcasting.`,
      );
    }

    // Sending-number gate (spec §2.3/2.4): a pinned RED number needs an
    // explicit confirmUnhealthyNumber flag; unpinned goes through the
    // health-aware router, which never picks a RED number.
    if (dto.gupshupAppId) {
      const pinned = await this.gupshupAppRepo.findOne({
        where: { gupshupAppId: dto.gupshupAppId, shopId },
      });
      if (!pinned) {
        throw new BadRequestException('Pinned sending number not found for this shop');
      }
      const health = await this.numberHealthService.getHealth(pinned);
      if (health.light === 'red' && !dto.confirmUnhealthyNumber) {
        throw new BadRequestException(
          `This number is currently unhealthy — ${health.reasons.join('; ')}. ` +
            `Sending now risks Meta restricting it. Retry with confirmUnhealthyNumber=true to send anyway.`,
        );
      }
    }

    const broadcast = await this.broadcastRepo.save(
      this.broadcastRepo.create({
        shopId,
        name: dto.name,
        templateName: template.elementName,
        templateLanguage: dto.templateLanguage || template.language || 'en',
        templateComponents: components,
        templateVariables: dto.bodyVariables || [],
        audienceTag: dto.audienceTag || null,
        gupshupAppId: dto.gupshupAppId || null,
        status: BroadcastStatus.QUEUED,
        totalRecipients: recipientCount,
        costPaise: 0,
      }),
    );

    await this.broadcastQueue.add(
      'dispatch',
      { broadcastId: broadcast.id },
      { attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    );

    this.logger.log(
      `Broadcast '${broadcast.name}' queued: ${recipientCount} recipients, ` +
      `est. ₹${(estimatedCostPaise / 100).toFixed(2)}`,
    );

    return {
      broadcast: this.serialize(broadcast),
      estimatedCostPaise,
      unitCostPaise,
    };
  }

  /** Audience size + per-message cost, used by the wizard's live estimate. */
  async estimate(shopId: string, audienceTag?: string, templateName?: string) {
    const { count } = await this.countAudience(shopId, audienceTag);

    let unitCostPaise = this.pricingService.getCost('marketing', 'IN');
    if (templateName) {
      const template = await this.templateRepo.findOne({
        where: { shopId, elementName: templateName },
      });
      if (template) {
        unitCostPaise = this.pricingService.getCost(
          template.category.toLowerCase() as any,
          'IN',
        );
      }
    }

    return {
      recipientCount: count,
      unitCostPaise,
      estimatedCostPaise: unitCostPaise * count,
    };
  }

  async list(shopId: string, page = 1, limit = 20) {
    const [data, total] = await this.broadcastRepo.findAndCount({
      where: { shopId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: data.map((b) => this.serialize(b)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOne(shopId: string, id: string) {
    const broadcast = await this.broadcastRepo.findOne({ where: { id, shopId } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    return this.serialize(broadcast);
  }

  /**
   * Stop a queued or in-flight campaign. The dispatch worker reloads the
   * row between batches and halts when it sees 'cancelled'; contacts
   * already dispatched stay sent, the rest are skipped (no charges, and
   * the skipped amount was never debited since debits happen per send).
   */
  async cancel(shopId: string, id: string) {
    const broadcast = await this.broadcastRepo.findOne({ where: { id, shopId } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    if (
      broadcast.status !== BroadcastStatus.QUEUED &&
      broadcast.status !== BroadcastStatus.SENDING
    ) {
      throw new BadRequestException(
        `Only queued or sending campaigns can be stopped — this one is ${broadcast.status}`,
      );
    }

    broadcast.status = BroadcastStatus.CANCELLED;
    broadcast.completedAt = new Date();
    await this.broadcastRepo.save(broadcast);
    this.logger.log(`Broadcast '${broadcast.name}' (${broadcast.id}) cancelled by shop ${shopId}`);
    return this.serialize(broadcast);
  }

  /**
   * Campaign summary (spec §2.1): live sent/delivered/read/failed counts
   * aggregated from the per-message rows, which status webhooks keep
   * current. Read-rate is of the delivered (reachable) portion.
   */
  async deliveryStats(shopId: string, broadcastId: string) {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId, shopId },
    });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

    const rows: Array<{ status: string; count: string }> = await this.messageRepo
      .createQueryBuilder('message')
      .select('message.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('message.broadcastId = :broadcastId', { broadcastId })
      .andWhere('message.shopId = :shopId', { shopId })
      .groupBy('message.status')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = Number(r.count);

    const queued = byStatus['queued'] || 0;
    const sent = byStatus['sent'] || 0;
    const delivered = byStatus['delivered'] || 0;
    const read = byStatus['read'] || 0;
    const failed = byStatus['failed'] || 0;

    // Progression semantics: delivered⊇read (a read message was delivered)
    const atLeastDelivered = delivered + read;
    const dispatched = queued + sent + atLeastDelivered + failed;

    return {
      broadcastId: broadcast.id,
      status: broadcast.status,
      totalRecipients: broadcast.totalRecipients,
      counts: { queued, sent, delivered: atLeastDelivered, read, failed },
      progressPct:
        broadcast.totalRecipients > 0
          ? Math.round((dispatched / broadcast.totalRecipients) * 100)
          : 0,
      readRate: atLeastDelivered > 0 ? Math.round((read / atLeastDelivered) * 100) : null,
      updatedAt: broadcast.updatedAt,
    };
  }

  private async countAudience(shopId: string, audienceTag?: string) {
    const qb = this.contactRepo
      .createQueryBuilder('contact')
      .where('contact.shopId = :shopId', { shopId })
      .andWhere('contact.optedIn = :optedIn', { optedIn: true });

    if (audienceTag) {
      qb.andWhere(':tag = ANY(contact.tags)', { tag: audienceTag });
    }

    const count = await qb.getCount();
    return { count };
  }

  private serialize(b: Broadcast) {
    return {
      id: b.id,
      name: b.name,
      templateName: b.templateName,
      templateLanguage: b.templateLanguage,
      templateVariables: b.templateVariables || [],
      audienceTag: b.audienceTag,
      gupshupAppId: b.gupshupAppId,
      status: b.status,
      totalRecipients: b.totalRecipients,
      sentCount: b.sentCount,
      failedCount: b.failedCount,
      skippedCount: b.skippedCount,
      costPaise: Number(b.costPaise),
      error: b.error,
      createdAt: b.createdAt,
      completedAt: b.completedAt,
    };
  }
}
