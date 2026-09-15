import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationRule, AutomationMatchType } from './entities/automation-rule.entity';
import { MessagesService } from '../messages/messages.service';

export interface RuleMatch {
  rule: AutomationRule;
  replyText: string;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(AutomationRule)
    private readonly ruleRepo: Repository<AutomationRule>,
    private readonly messagesService: MessagesService,
  ) {}

  async list(shopId: string) {
    const [data, total] = await this.ruleRepo.findAndCount({
      where: { shopId },
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async create(
    shopId: string,
    dto: { name: string; keyword: string; matchType?: string; replyText: string },
  ) {
    if (!dto.name?.trim() || !dto.keyword?.trim() || !dto.replyText?.trim()) {
      throw new BadRequestException('name, keyword and replyText are required');
    }
    const rule = this.ruleRepo.create({
      shopId,
      name: dto.name.trim().slice(0, 120),
      keyword: dto.keyword.trim().slice(0, 120),
      matchType: this.validateMatchType(dto.matchType),
      replyText: dto.replyText.trim().slice(0, 1024),
    });
    return this.ruleRepo.save(rule);
  }

  async update(
    shopId: string,
    id: string,
    dto: {
      name?: string;
      keyword?: string;
      matchType?: string;
      replyText?: string;
      enabled?: boolean;
    },
  ) {
    const rule = await this.ruleRepo.findOne({ where: { id, shopId } });
    if (!rule) throw new NotFoundException('Automation rule not found');

    if (dto.name !== undefined) rule.name = dto.name.trim().slice(0, 120);
    if (dto.keyword !== undefined) rule.keyword = dto.keyword.trim().slice(0, 120);
    if (dto.replyText !== undefined)
      rule.replyText = dto.replyText.trim().slice(0, 1024);
    if (dto.matchType !== undefined) rule.matchType = this.validateMatchType(dto.matchType);
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;

    return this.ruleRepo.save(rule);
  }

  async remove(shopId: string, id: string) {
    const rule = await this.ruleRepo.findOne({ where: { id, shopId } });
    if (!rule) throw new NotFoundException('Automation rule not found');
    await this.ruleRepo.remove(rule);
    return { deleted: true };
  }

  /**
   * Evaluate enabled rules for a shop against an inbound message body.
   * First matching rule (by creation order) wins. Returns null when no
   * rule matches — callers then do nothing.
   */
  async matchRule(shopId: string, inboundText: string): Promise<AutomationRule | null> {
    if (!inboundText) return null;
    const rules = await this.ruleRepo.find({
      where: { shopId, enabled: true },
      order: { createdAt: 'ASC' },
    });
    const text = inboundText.trim().toLowerCase();

    for (const rule of rules) {
      const keyword = rule.keyword.trim().toLowerCase();
      if (!keyword) continue;
      const matched =
        rule.matchType === AutomationMatchType.EXACT
          ? text === keyword
          : rule.matchType === AutomationMatchType.STARTS_WITH
            ? text.startsWith(keyword)
            : text.includes(keyword);
      if (matched) return rule;
    }
    return null;
  }

  /**
   * Execute a matched rule: send the configured reply through the SAME
   * message pipeline (validation, wallet, provider) as human sends, then
   * record the trigger on the rule. Never throws to the webhook caller —
   * failures are logged and counted, the inbound message is unaffected.
   */
  async executeRule(rule: AutomationRule, contactWaId: string): Promise<boolean> {
    try {
      await this.messagesService.sendMessage(rule.shopId, {
        contactWaId,
        type: 'text',
        text: rule.replyText,
      });
      await this.ruleRepo.update(rule.id, {
        triggeredCount: rule.triggeredCount + 1,
        lastTriggeredAt: new Date(),
      });
      this.logger.log(
        `Automation rule '${rule.name}' fired for shop ${rule.shopId} → ${contactWaId}`,
      );
      return true;
    } catch (err: any) {
      // Reply can legitimately fail (session expired → needs template,
      // insufficient balance). Record it, don't break webhook processing.
      this.logger.warn(
        `Automation rule '${rule.name}' failed: ${err?.message}`,
      );
      return false;
    }
  }

  private validateMatchType(matchType?: string): AutomationMatchType {
    if (!matchType) return AutomationMatchType.CONTAINS;
    if (!Object.values(AutomationMatchType).includes(matchType as any)) {
      throw new BadRequestException('matchType must be contains, exact or starts_with');
    }
    return matchType as AutomationMatchType;
  }
}
