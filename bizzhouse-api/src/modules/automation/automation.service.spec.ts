import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AutomationMatchType } from './entities/automation-rule.entity';

describe('AutomationService', () => {
  let service: AutomationService;
  let mockRuleRepo: any;
  let mockMessagesService: any;

  const mkRule = (over: Partial<any> = {}) => ({
    id: 'rule-1',
    shopId: 'shop-1',
    name: 'Price reply',
    keyword: 'price',
    matchType: AutomationMatchType.CONTAINS,
    replyText: 'Catalogue starts at ₹499',
    enabled: true,
    triggeredCount: 0,
    ...over,
  });

  beforeEach(() => {
    mockRuleRepo = {
      // Respect the where-clause the way Postgres would, so tests prove
      // the service relies on the query (e.g. enabled: true), not luck.
      find: vi.fn(async (opts: any = {}) => {
        let rules: any[] = (mockRuleRepo as any).__rules || [];
        if (opts?.where?.shopId) {
          rules = rules.filter((r) => r.shopId === opts.where.shopId);
        }
        if (opts?.where?.enabled !== undefined) {
          rules = rules.filter((r) => r.enabled === opts.where.enabled);
        }
        return rules;
      }),
      findAndCount: vi.fn().mockResolvedValue([[], 0]),
      create: vi.fn((d) => ({ id: 'rule-new', enabled: true, ...d })),
      save: vi.fn(async (d) => d),
      findOne: vi.fn(),
      update: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    };
    mockMessagesService = {
      sendMessage: vi.fn(async () => ({ status: 'sent' })),
    };
    service = new AutomationService(mockRuleRepo, mockMessagesService);
  });

  describe('matchRule', () => {
    it('matches a contains-rule case-insensitively', async () => {
      (mockRuleRepo as any).__rules = [mkRule()];
      const rule = await service.matchRule('shop-1', 'What is the PRICE of this?');
      expect(rule).not.toBeNull();
      expect(rule!.keyword).toBe('price');
    });

    it('does not match when disabled rules are the only ones', async () => {
      (mockRuleRepo as any).__rules = [mkRule({ enabled: false })];
      const rule = await service.matchRule('shop-1', 'what is the price');
      expect(rule).toBeNull();
    });

    it('exact match type does not match partial text', async () => {
      (mockRuleRepo as any).__rules = [mkRule({ matchType: AutomationMatchType.EXACT })];
      expect(await service.matchRule('shop-1', 'what is the price')).toBeNull();
      expect(await service.matchRule('shop-1', 'PRICE')).not.toBeNull();
    });

    it('starts_with match type requires the prefix', async () => {
      (mockRuleRepo as any).__rules = [
        mkRule({ matchType: AutomationMatchType.STARTS_WITH }),
      ];
      expect(await service.matchRule('shop-1', 'price list please')).not.toBeNull();
      expect(await service.matchRule('shop-1', 'tell me the price')).toBeNull();
    });

    it('first rule in creation order wins', async () => {
      (mockRuleRepo as any).__rules = [
        mkRule({ id: 'r1', keyword: 'price' }),
        mkRule({ id: 'r2', keyword: 'cost' }),
      ];
      const rule = await service.matchRule('shop-1', 'what is the price and cost');
      expect(rule!.id).toBe('r1');
    });

    it('returns null for empty message bodies', async () => {
      expect(await service.matchRule('shop-1', '')).toBeNull();
      expect(await service.matchRule('shop-1', '   ')).toBeNull();
    });
  });

  describe('executeRule', () => {
    it('sends the reply through the normal pipeline and records the trigger', async () => {
      const rule = mkRule({ triggeredCount: 2 });
      const ok = await service.executeRule(rule, '919876543211');
      expect(ok).toBe(true);
      expect(mockMessagesService.sendMessage).toHaveBeenCalledWith('shop-1', {
        contactWaId: '919876543211',
        type: 'text',
        text: 'Catalogue starts at ₹499',
      });
      expect(mockRuleRepo.update).toHaveBeenCalledWith('rule-1', {
        triggeredCount: 3,
        lastTriggeredAt: expect.any(Date),
      });
    });

    it('does not throw when the send fails (e.g. insufficient balance)', async () => {
      mockMessagesService.sendMessage.mockRejectedValue(
        new BadRequestException('Insufficient wallet balance.'),
      );
      const ok = await service.executeRule(mkRule(), '919876543211');
      expect(ok).toBe(false);
      expect(mockRuleRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('rejects empty fields', async () => {
      await expect(
        service.create('shop-1', { name: '', keyword: 'x', replyText: 'y' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unknown match types', async () => {
      await expect(
        service.create('shop-1', {
          name: 'r',
          keyword: 'x',
          replyText: 'y',
          matchType: 'regex',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
