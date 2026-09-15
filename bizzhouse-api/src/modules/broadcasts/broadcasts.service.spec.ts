import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';

describe('BroadcastsService', () => {
  let service: BroadcastsService;
  let mockBroadcastRepo: any;
  let mockContactRepo: any;
  let mockTemplateRepo: any;
  let mockGupshupAppRepo: any;
  let mockNumberHealthService: any;
  let mockMessageRepo: any;
  let mockWalletService: any;
  let mockPricingService: any;
  let mockQueue: any;

  beforeEach(() => {
    mockBroadcastRepo = {
      create: vi.fn((data) => ({ id: 'bcast-1', ...data })),
      save: vi.fn(async (data) => ({ id: 'bcast-1', sentCount: 0, failedCount: 0, costPaise: 0, ...data })),
      findAndCount: vi.fn(),
      findOne: vi.fn(),
    };
    mockContactRepo = {
      createQueryBuilder: vi.fn(() => {
        // Stable shared qb so per-test getCount overrides stick
        (mockContactRepo as any).__qb ??= {
          where: vi.fn().mockReturnThis(),
          andWhere: vi.fn().mockReturnThis(),
          getCount: vi.fn().mockResolvedValue(200),
        };
        return (mockContactRepo as any).__qb;
      }),
    };
    mockTemplateRepo = {
      findOne: vi.fn(),
    };
    mockGupshupAppRepo = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    mockNumberHealthService = {
      getHealth: vi.fn().mockResolvedValue({
        light: 'green',
        reasons: [],
      }),
    };
    mockMessageRepo = {
      rawRows: [] as Array<{ status: string; count: string }>,
      lastQb: null as any,
      createQueryBuilder: vi.fn(function () {
        const qb: any = {};
        for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) {
          qb[m] = vi.fn().mockReturnValue(qb);
        }
        qb.getRawMany = vi.fn(() => Promise.resolve(mockMessageRepo.rawRows));
        mockMessageRepo.lastQb = qb;
        return qb;
      }),
    };
    mockWalletService = {
      getBalance: vi.fn().mockResolvedValue(100000),
    };
    mockPricingService = {
      getCost: vi.fn().mockReturnValue(150),
    };
    mockQueue = {
      add: vi.fn(async () => ({})),
    };

    service = new BroadcastsService(
      mockBroadcastRepo,
      mockContactRepo,
      mockTemplateRepo,
      mockGupshupAppRepo,
      mockMessageRepo,
      mockNumberHealthService,
      mockWalletService,
      mockPricingService,
      mockQueue,
    );
  });

  describe('create', () => {
    const validDto = { name: 'Diwali Blast', templateName: 'festive_offer_v2' };

    it('should reject when template does not exist', async () => {
      mockTemplateRepo.findOne.mockResolvedValue(null);

      await expect(service.create('shop-1', validDto)).rejects.toThrow(NotFoundException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should reject when template is not APPROVED', async () => {
      mockTemplateRepo.findOne.mockResolvedValue({
        elementName: 'festive_offer_v2',
        category: 'MARKETING',
        status: 'IN_REVIEW',
        language: 'en',
      });

      await expect(service.create('shop-1', validDto)).rejects.toThrow(BadRequestException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should reject when no opted-in contacts match the audience', async () => {
      mockTemplateRepo.findOne.mockResolvedValue({
        elementName: 'festive_offer_v2',
        category: 'MARKETING',
        status: 'APPROVED',
        language: 'en',
      });
      mockContactRepo.createQueryBuilder().getCount.mockResolvedValue(0);

      await expect(service.create('shop-1', validDto)).rejects.toThrow(BadRequestException);
    });

    it('should reject when wallet cannot cover the estimated cost', async () => {
      mockTemplateRepo.findOne.mockResolvedValue({
        elementName: 'festive_offer_v2',
        category: 'MARKETING',
        status: 'APPROVED',
        language: 'en',
      });
      // 200 recipients × 150 paise = ₹300 needed; wallet has ₹100
      mockWalletService.getBalance.mockResolvedValue(10000);

      await expect(service.create('shop-1', validDto)).rejects.toThrow(BadRequestException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should queue a broadcast for an approved template with funded wallet', async () => {
      mockTemplateRepo.findOne.mockResolvedValue({
        elementName: 'festive_offer_v2',
        category: 'MARKETING',
        status: 'APPROVED',
        language: 'en',
      });

      const result = await service.create('shop-1', validDto);

      expect(result.broadcast.status).toBe('queued');
      expect(result.broadcast.totalRecipients).toBe(200);
      expect(result.unitCostPaise).toBe(150);
      expect(result.estimatedCostPaise).toBe(30000);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'dispatch',
        { broadcastId: 'bcast-1' },
        expect.objectContaining({ attempts: 1 }),
      );
    });
  });

  describe('deliveryStats', () => {
    const bcast = {
      id: 'bcast-1',
      shopId: 'shop-1',
      status: 'sending',
      totalRecipients: 100,
      name: 'Diwali Blast',
      templateName: 'festive_offer_v2',
      templateLanguage: 'en',
      templateVariables: [],
      audienceTag: null,
      gupshupAppId: null,
      sentCount: 90,
      failedCount: 4,
      skippedCount: 0,
      costPaise: 0,
      error: null,
      createdAt: new Date('2026-09-01'),
      updatedAt: new Date('2026-09-01'),
    };

    beforeEach(() => {
      mockBroadcastRepo.findOne.mockResolvedValue(bcast);
    });

    it('throws 404 for another shop\'s campaign', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue(null);
      await expect(service.deliveryStats('shop-999', 'bcast-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('aggregates webhook-driven statuses into campaign totals', async () => {
      mockMessageRepo.rawRows = [
        { status: 'sent', count: '10' },
        { status: 'delivered', count: '70' },
        { status: 'read', count: '15' },
        { status: 'failed', count: '4' },
        { status: 'queued', count: '1' },
      ];

      const stats = await service.deliveryStats('shop-1', 'bcast-1');

      // scoped to this shop's campaign, in SQL and via the tenant-checked row
      expect(mockMessageRepo.lastQb.where).toHaveBeenCalledWith(
        'message.broadcastId = :broadcastId',
        { broadcastId: 'bcast-1' },
      );
      expect(mockMessageRepo.lastQb.andWhere).toHaveBeenCalledWith(
        'message.shopId = :shopId',
        { shopId: 'shop-1' },
      );
      // delivered counts everything at-least-delivered (delivered ⊇ read)
      expect(stats.counts).toEqual({ queued: 1, sent: 10, delivered: 85, read: 15, failed: 4 });
      expect(stats.readRate).toBe(Math.round((15 / 85) * 100));
      expect(stats.progressPct).toBe(100);
    });

    it('handles campaigns with no messages yet', async () => {
      mockMessageRepo.rawRows = [];
      const stats = await service.deliveryStats('shop-1', 'bcast-1');
      expect(stats.counts).toEqual({ queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 });
      expect(stats.readRate).toBeNull();
      expect(stats.progressPct).toBe(0);
    });
  });
});
