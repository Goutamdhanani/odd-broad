import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;
  let mockRateCardRepo: any;

  beforeEach(() => {
    mockRateCardRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(undefined),
      create: vi.fn((data: any) => ({ ...data })),
      save: vi.fn(async (card: any) => card),
    };
    service = new PricingService(mockRateCardRepo);
  });

  it('should return correct pricing for India (IN)', () => {
    expect(service.getCost('marketing', 'IN')).toBe(150); // ₹1.50
    expect(service.getCost('utility', 'IN')).toBe(30);     // ₹0.30
    expect(service.getCost('authentication', 'IN')).toBe(30);
    expect(service.getCost('service', 'IN')).toBe(0);      // Free
  });

  it('should fallback to DEFAULT for unknown country codes', () => {
    expect(service.getCost('marketing', 'US')).toBe(200);
    expect(service.getCost('utility', 'GB')).toBe(50);
    expect(service.getCost('service', 'AE')).toBe(0);
  });

  it('should allow runtime price table updates persisted to DB', async () => {
    await service.updatePrices({ 'marketing:IN': 180 });
    expect(service.getCost('marketing', 'IN')).toBe(180);
    expect(mockRateCardRepo.save).toHaveBeenCalled();
  });

  it('should export current price table', () => {
    const table = service.getPriceTable();
    expect(table['marketing:IN']).toBe(150);
  });
});
