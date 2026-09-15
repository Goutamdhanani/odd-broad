import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NumberHealthService, tierCeiling } from './number-health.service';

describe('tierCeiling', () => {
  it('maps the documented Meta tiers', () => {
    expect(tierCeiling('TIER_250')).toBe(250);
    expect(tierCeiling('TIER_1K')).toBe(1_000);
    expect(tierCeiling('TIER_10K')).toBe(10_000);
    expect(tierCeiling('TIER_100K')).toBe(100_000);
    expect(tierCeiling('TIER_UNLIMITED')).toBe(Number.POSITIVE_INFINITY);
  });

  it('parses K and M suffix variants', () => {
    expect(tierCeiling('TIER_5K')).toBe(5_000);
    expect(tierCeiling('TIER_1M')).toBe(1_000_000);
    expect(tierCeiling('tier_2k')).toBe(2_000); // case-insensitive
  });

  it('falls back to the conservative Tier-0 default', () => {
    expect(tierCeiling(null)).toBe(250);
    expect(tierCeiling(undefined)).toBe(250);
    expect(tierCeiling('GARBAGE')).toBe(250);
  });
});

function rows(count: number, failed = 0) {
  return [
    ...Array.from({ length: failed }, () => ({ status: 'failed' })),
    ...Array.from({ length: count - failed }, () => ({ status: 'sent' })),
  ];
}

describe('NumberHealthService', () => {
  let service: NumberHealthService;
  let mockAppRepo: any;
  let mockMessageRepo: any;
  let mockGupshupService: any;

  const liveApp = (overrides: Record<string, any> = {}) => ({
    id: 'app-1',
    shopId: 'shop-1',
    gupshupAppId: 'gs-app-1',
    wabaStatus: 'live',
    qualityRating: null,
    messagingTier: 'TIER_10K',
    lastRatingsCheck: null,
    ...overrides,
  });

  beforeEach(() => {
    mockAppRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      update: vi.fn(async () => {}),
    };
    mockMessageRepo = {
      find: vi.fn(async () => [] as any[]),
    };
    mockGupshupService = {
      getRatings: vi.fn().mockResolvedValue({ message: 'no event update available', status: 'success' }),
    };
    service = new NumberHealthService(mockAppRepo, mockMessageRepo, mockGupshupService);
  });

  describe('getHealth — composite of Meta rating + own 24h stats (spec §2.3)', () => {
    it('GREEN rating with low volume is green', async () => {
      const app = liveApp({ qualityRating: 'GREEN' });
      mockMessageRepo.find.mockResolvedValue(rows(10));
      const health = await service.getHealth(app as any);
      expect(health.light).toBe('green');
      expect(health.usageRatio).toBeCloseTo(0.001);
      expect(health.reasons).toEqual([]);
    });

    it("Meta's RED rating is immediately red", async () => {
      const app = liveApp({ qualityRating: 'RED' });
      mockMessageRepo.find.mockResolvedValue(rows(50, 0));
      const health = await service.getHealth(app as any);
      expect(health.light).toBe('red');
      expect(health.reasons.join(' ')).toMatch(/quality rating is RED/i);
    });

    it('YELLOW rating caps at yellow', async () => {
      const app = liveApp({ qualityRating: 'YELLOW' });
      mockMessageRepo.find.mockResolvedValue(rows(5));
      const health = await service.getHealth(app as any);
      expect(health.light).toBe('yellow');
    });

    it('failure rate above 30% (20+ sends) is red, above 10% is yellow', async () => {
      mockMessageRepo.find.mockResolvedValue(rows(100, 35));
      const red = await service.getHealth(liveApp({ qualityRating: 'GREEN' }) as any);
      expect(red.light).toBe('red');
      expect(red.reasons.join(' ')).toMatch(/35% of sends failed/);

      mockMessageRepo.find.mockResolvedValue(rows(100, 15));
      const yellow = await service.getHealth(liveApp({ qualityRating: 'GREEN' }) as any);
      expect(yellow.light).toBe('yellow');
    });

    it('ignores failure rate on tiny samples (under 20 sends)', async () => {
      mockMessageRepo.find.mockResolvedValue(rows(4, 2)); // 50% but n=4
      const health = await service.getHealth(liveApp({ qualityRating: 'GREEN' }) as any);
      expect(health.light).toBe('green');
    });

    it('volume at 70% of ceiling warns yellow, at ceiling goes red', async () => {
      mockMessageRepo.find.mockResolvedValue(rows(7_000));
      const warn = await service.getHealth(liveApp({ qualityRating: 'GREEN' }) as any);
      expect(warn.light).toBe('yellow');
      expect(warn.reasons.join(' ')).toMatch(/70% of the daily send limit/);

      mockMessageRepo.find.mockResolvedValue(rows(10_000));
      const full = await service.getHealth(liveApp({ qualityRating: 'GREEN' }) as any);
      expect(full.light).toBe('red');
      expect(full.reasons.join(' ')).toMatch(/Daily send limit reached/);
    });

    it('reports the ceiling from the stored tier (null tier → 250)', async () => {
      mockMessageRepo.find.mockResolvedValue(rows(1));
      const health = await service.getHealth(liveApp({ messagingTier: null }) as any);
      expect(health.dailyCeiling).toBe(250);
      expect(health.usageRatio).toBeCloseTo(0.004);
    });
  });

  describe('pickSendingNumber — routing (spec §2.4)', () => {
    it('honors a pinned live, healthy number', async () => {
      const app = liveApp({ qualityRating: 'GREEN' });
      mockAppRepo.findOne.mockResolvedValue(app);
      mockMessageRepo.find.mockResolvedValue(rows(5));
      expect(await service.pickSendingNumber('shop-1', 'gs-app-1')).toBe(app);
    });

    it('rejects a pinned number that is not a live number of this shop', async () => {
      mockAppRepo.findOne.mockResolvedValue(null);
      await expect(service.pickSendingNumber('shop-1', 'gs-nope')).rejects.toThrow(/not a live number/);
    });

    it('refuses to route a pinned RED number', async () => {
      mockAppRepo.findOne.mockResolvedValue(liveApp({ qualityRating: 'RED' }));
      await expect(service.pickSendingNumber('shop-1', 'gs-app-1')).rejects.toThrow(/unhealthy/);
    });

    it('never auto-picks a RED number — chooses the healthiest by remaining capacity', async () => {
      const appA = liveApp({ gupshupAppId: 'gs-A' }); // near ceiling → red
      const appB = liveApp({ gupshupAppId: 'gs-B' }); // 20% used
      const appC = liveApp({ gupshupAppId: 'gs-C' }); // 1% used
      mockAppRepo.find.mockResolvedValue([appA, appB, appC]);
      mockMessageRepo.find.mockImplementation(async ({ where }: any) => {
        if (where.gupshupAppId === 'gs-A') return rows(11_000);
        if (where.gupshupAppId === 'gs-B') return rows(2_000);
        return rows(100);
      });
      const picked = await service.pickSendingNumber('shop-1');
      expect(picked.gupshupAppId).toBe('gs-C');
    });

    it('throws when every connected number is unhealthy', async () => {
      mockAppRepo.find.mockResolvedValue([liveApp({ gupshupAppId: 'gs-A', qualityRating: 'RED' })]);
      mockMessageRepo.find.mockResolvedValue(rows(1));
      await expect(service.pickSendingNumber('shop-1')).rejects.toThrow(/All connected numbers/);
    });

    it('throws a clear error when the shop has no live numbers at all', async () => {
      mockAppRepo.find.mockResolvedValue([]);
      await expect(service.pickSendingNumber('shop-1')).rejects.toThrow(/No live WhatsApp number/);
    });
  });

  describe('canContinueSending — mid-campaign guard', () => {
    it('stops when the number goes red', async () => {
      mockMessageRepo.find.mockResolvedValue(rows(11_000));
      const guard = await service.canContinueSending(liveApp({ qualityRating: 'GREEN' }) as any);
      expect(guard.ok).toBe(false);
      expect(guard.reasons.length).toBeGreaterThan(0);
    });

    it('allows green and yellow to continue', async () => {
      mockMessageRepo.find.mockResolvedValue(rows(5_000)); // 50% — yellow
      const guard = await service.canContinueSending(liveApp({ qualityRating: 'GREEN' }) as any);
      expect(guard.ok).toBe(true);
    });
  });

  describe('pollRatings — the ONLY ratings-API caller (rate-limited 10/min)', () => {
    it('caches quality + tier when the provider reports an update', async () => {
      const app = liveApp();
      mockAppRepo.find.mockResolvedValue([app]);
      mockGupshupService.getRatings.mockResolvedValue({
        phoneQuality: 'GREEN',
        currentLimit: 'TIER_1K',
        event: 'VERIFIED_NUMBER',
      });

      await service.pollRatings();

      expect(mockAppRepo.update).toHaveBeenCalledWith(
        'app-1',
        expect.objectContaining({ qualityRating: 'GREEN', messagingTier: 'TIER_1K' }),
      );
      const patch = mockAppRepo.update.mock.calls[0][1];
      expect(patch.lastRatingsCheck).toBeInstanceOf(Date);
    });

    it('treats "no event update available" as normal — only refreshes the check timestamp', async () => {
      const app = liveApp({ qualityRating: 'GREEN', messagingTier: 'TIER_10K' });
      mockAppRepo.find.mockResolvedValue([app]);
      mockGupshupService.getRatings.mockResolvedValue({
        message: 'no event update available',
        status: 'success',
      });

      await service.pollRatings();

      const patch = mockAppRepo.update.mock.calls[0][1];
      expect(patch.lastRatingsCheck).toBeInstanceOf(Date);
      expect(patch.qualityRating).toBeUndefined(); // cached values kept
      expect(patch.messagingTier).toBeUndefined();
    });

    it('never throws to the cron — a failing app only logs a warning', async () => {
      mockAppRepo.find.mockResolvedValue([liveApp(), liveApp({ id: 'app-2', gupshupAppId: 'gs-2' })]);
      mockGupshupService.getRatings
        .mockRejectedValueOnce(new Error('rate limited'))
        .mockResolvedValueOnce({ phoneQuality: 'YELLOW', currentLimit: 'TIER_1K' });

      await expect(service.pollRatings()).resolves.toBeUndefined();
      // Second app still got its update despite the first failing
      expect(mockAppRepo.update).toHaveBeenCalledTimes(1);
      expect(mockAppRepo.update).toHaveBeenCalledWith(
        'app-2',
        expect.objectContaining({ qualityRating: 'YELLOW' }),
      );
    });
  });
});
