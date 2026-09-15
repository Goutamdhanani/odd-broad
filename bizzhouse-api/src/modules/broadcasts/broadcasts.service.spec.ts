import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BroadcastsService } from './broadcasts.service';

describe('BroadcastsService', () => {
  let service: BroadcastsService;
  let mockBroadcastRepo: any;
  let mockContactRepo: any;
  let mockTemplateRepo: any;
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
});
