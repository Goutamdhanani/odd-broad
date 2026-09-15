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
      reasonRows: [] as Array<{ code: string; title: string; count: number }>,
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
      query: vi.fn(() => Promise.resolve([])),
      findAndCount: vi.fn().mockResolvedValue([[], 0]),
    };
    // query() resolves the mutable reason rows set per-test
    mockMessageRepo.query = vi.fn(() => Promise.resolve(mockMessageRepo.reasonRows));
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

  describe('cancel', () => {
    const bcast = (status: string) => ({
      id: 'bcast-1',
      shopId: 'shop-1',
      name: 'Diwali Blast',
      templateName: 'festive_offer_v2',
      templateLanguage: 'en',
      templateVariables: [],
      audienceTag: null,
      gupshupAppId: null,
      status,
      totalRecipients: 200,
      sentCount: 10,
      failedCount: 0,
      skippedCount: 0,
      costPaise: 1500,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('cancels a queued campaign', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue(bcast('queued'));
      const res = await service.cancel('shop-1', 'bcast-1');
      expect(res.status).toBe('cancelled');
      expect(mockBroadcastRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
      );
    });

    it('cancels a sending campaign', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue(bcast('sending'));
      const res = await service.cancel('shop-1', 'bcast-1');
      expect(res.status).toBe('cancelled');
    });

    it('refuses to cancel a completed campaign', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue(bcast('completed'));
      await expect(service.cancel('shop-1', 'bcast-1')).rejects.toThrow(BadRequestException);
    });

    it('404s for another shop\'s campaign and never writes', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue(null);
      await expect(service.cancel('shop-999', 'bcast-1')).rejects.toThrow(NotFoundException);
      expect(mockBroadcastRepo.save).not.toHaveBeenCalled();
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

    it('404s failedMessages for another shop\'s campaign', async () => {
      mockBroadcastRepo.findOne.mockResolvedValue(null);
      await expect(service.failedMessages('shop-999', 'bcast-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lists failed recipients with contact identity and reason', async () => {
      mockMessageRepo.findAndCount.mockResolvedValue([
        [
          {
            id: 'm-1',
            createdAt: new Date('2026-09-10'),
            payload: { failureReason: { code: 131047, title: 'Re-engagement required' } },
            contact: { waId: '919876543211', name: 'Pooja' },
          },
          {
            id: 'm-2',
            createdAt: new Date('2026-09-10'),
            payload: {},
            contact: { waId: '919876543212', name: null },
          },
        ],
        2,
      ]);

      const res = await service.failedMessages('shop-1', 'bcast-1');
      expect(res.total).toBe(2);
      expect(res.data[0].contactWaId).toBe('919876543211');
      expect(res.data[0].contactName).toBe('Pooja');
      expect(res.data[0].reason).toEqual({ code: 131047, title: 'Re-engagement required' });
      expect(res.data[1].reason).toBeNull();
      expect(res.data[1].contactWaId).toBe('919876543212');
      // scoped to this shop + campaign + failed only
      const where = mockMessageRepo.findAndCount.mock.calls[0][0].where;
      expect(where).toMatchObject({ broadcastId: 'bcast-1', shopId: 'shop-1', status: 'failed' });
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
      expect(stats.failureReasons).toEqual([]); // no failures -> no reason query needed
    });

    it('aggregates the top failure reasons when a campaign has failures', async () => {
      mockMessageRepo.rawRows = [
        { status: 'sent', count: '90' },
        { status: 'failed', count: '10' },
      ];
      mockMessageRepo.reasonRows = [
        { code: '131047', title: 'Re-engagement message required', count: 7 },
        { code: '131026', title: 'Message undeliverable', count: 3 },
      ];

      const stats = await service.deliveryStats('shop-1', 'bcast-1');
      expect(stats.counts.failed).toBe(10);
      expect(stats.failureReasons).toEqual([
        { code: '131047', title: 'Re-engagement message required', count: 7 },
        { code: '131026', title: 'Message undeliverable', count: 3 },
      ]);
    });
  });
});
