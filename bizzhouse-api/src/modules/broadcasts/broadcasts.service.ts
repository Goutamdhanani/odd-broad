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
import { Template, TemplateStatus } from '../templates/entities/template.entity';
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
    let components = dto.templateComponents || [];
    const variablesInBody = countTemplateVariables(template.body);
    if (components.length === 0 && dto.bodyVariables?.length) {
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

    const broadcast = await this.broadcastRepo.save(
      this.broadcastRepo.create({
        shopId,
        name: dto.name,
        templateName: template.elementName,
        templateLanguage: dto.templateLanguage || template.language || 'en',
        templateComponents: components,
        audienceTag: dto.audienceTag || null,
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
      audienceTag: b.audienceTag,
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
