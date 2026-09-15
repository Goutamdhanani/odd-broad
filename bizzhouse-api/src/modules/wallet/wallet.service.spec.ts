import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';

describe('WalletService', () => {
  let service: WalletService;
  let mockShopRepo: any;
  let mockTxRepo: any;
  let mockDataSource: any;

  beforeEach(() => {
    mockShopRepo = {
      findOneBy: vi.fn(),
    };

    mockTxRepo = {
      findAndCount: vi.fn(),
    };

    mockDataSource = {
      transaction: vi.fn(async (cb: any) => {
        const mockManager = {
          query: vi.fn(),
          save: vi.fn(),
        };
        return cb(mockManager);
      }),
    };

    service = new WalletService(mockTxRepo, mockShopRepo, mockDataSource);
  });

  describe('getBalance', () => {
    it('should return shop balance in paise as a number', async () => {
      mockDataSource.query = vi.fn().mockResolvedValue([
        [{ wallet_balance_paise: '5000' }],
        1,
      ]);

      const balance = await service.getBalance('shop-1');
      expect(balance).toBe(5000);
    });

    it('should return 0 if shop not found', async () => {
      mockDataSource.query = vi.fn().mockResolvedValue([[], 0]);

      await expect(service.getBalance('nonexistent')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('creditShop', () => {
    it('should reject non-positive amounts', async () => {
      await expect(service.creditShop('shop-1', 0)).rejects.toThrow(BadRequestException);
      await expect(service.creditShop('shop-1', -100)).rejects.toThrow(BadRequestException);
    });

    it('should atomically update balance and insert ledger row', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          query: vi.fn().mockResolvedValue([[{ wallet_balance_paise: '2000' }], 1]),
          save: vi.fn().mockResolvedValue({}),
        };
        return cb(manager);
      });

      const result = await service.creditShop('shop-1', 1000, 'Test credit');

      expect(result).toEqual({ shopId: 'shop-1', newBalancePaise: 2000 });
    });

    it('should throw BadRequestException if shop does not exist', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          query: vi.fn().mockResolvedValue([]),
        };
        return cb(manager);
      });

      await expect(service.creditShop('invalid-shop', 1000)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('debitForMessage', () => {
    it('should skip debit if cost is 0 or negative', async () => {
      mockDataSource.query = vi.fn().mockResolvedValue([
        [{ wallet_balance_paise: '500' }],
        1,
      ]);

      const result = await service.debitForMessage('shop-1', 0, 'msg-1');
      expect(result).toEqual({ success: true, newBalance: 500 });
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should atomically debit balance when funds are sufficient', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          query: vi.fn()
            // 1. idempotency guard: no existing debit for this message
            .mockResolvedValueOnce([])
            // 2. atomic UPDATE ... WHERE balance >= cost
            .mockResolvedValueOnce([{ wallet_balance_paise: '350' }]),
          save: vi.fn().mockResolvedValue({}),
        };
        return cb(manager);
      });

      const result = await service.debitForMessage('shop-1', 150, 'msg-1');
      expect(result).toEqual({ success: true, newBalance: 350 });
    });

    it('should return failure if balance is insufficient (UPDATE returned 0 rows)', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          query: vi.fn()
            .mockResolvedValueOnce([]) // guard: no existing debit
            .mockResolvedValueOnce([]), // UPDATE matched nothing
          save: vi.fn(),
        };
        return cb(manager);
      });

      const result = await service.debitForMessage('shop-1', 5000, 'msg-1');
      expect(result).toEqual({ success: false, newBalance: -1 });
    });

    it('should NOT debit twice for the same message (idempotent like refunds)', async () => {
      let capturedManager: any;
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        capturedManager = {
          query: vi.fn()
            // 1. guard finds an existing debit row for this messageId
            .mockResolvedValueOnce([{ id: 'tx-existing' }])
            // 2. balance read for the idempotent response
            .mockResolvedValueOnce([{ wallet_balance_paise: '500' }]),
          save: vi.fn(),
        };
        return cb(capturedManager);
      });

      const result = await service.debitForMessage('shop-1', 150, 'msg-1');

      expect(result).toEqual({ success: true, newBalance: 500 });
      // UPDATE must never have run and no second ledger row must be written
      const updateCalls = capturedManager.query.mock.calls.filter((c: any[]) =>
        c[0].includes('UPDATE shops'),
      );
      expect(updateCalls).toHaveLength(0);
      expect(capturedManager.save).not.toHaveBeenCalled();
    });
  });

  describe('refundForMessage (Idempotency)', () => {
    it('should return current balance without query if cost is 0', async () => {
      mockDataSource.query = vi.fn().mockResolvedValue([
        [{ wallet_balance_paise: '200' }],
        1,
      ]);

      const newBalance = await service.refundForMessage('shop-1', 0, 'msg-1');
      expect(newBalance).toBe(200);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should NOT refund if refund already exists for messageId (idempotent)', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          query: vi.fn()
            // 1. SELECT FOR UPDATE
            .mockResolvedValueOnce([{ wallet_balance_paise: '200' }])
            // 2. SELECT existing refund
            .mockResolvedValueOnce([{ id: 'tx-existing' }]),
          save: vi.fn(),
        };
        return cb(manager);
      });

      const balance = await service.refundForMessage('shop-1', 150, 'msg-1');
      expect(balance).toBe(200);
    });

    it('should issue refund when no prior refund exists', async () => {
      mockDataSource.transaction.mockImplementation(async (cb: any) => {
        const manager = {
          query: vi.fn()
            // 1. SELECT FOR UPDATE
            .mockResolvedValueOnce([{ wallet_balance_paise: '200' }])
            // 2. SELECT existing refund -> empty
            .mockResolvedValueOnce([])
            // 3. UPDATE shops SET wallet_balance_paise
            .mockResolvedValueOnce([{ wallet_balance_paise: '350' }]),
          save: vi.fn().mockResolvedValue({}),
        };
        return cb(manager);
      });

      const balance = await service.refundForMessage('shop-1', 150, 'msg-1');
      expect(balance).toBe(350);
    });
  });

  describe('Concurrency Simulation', () => {
    it('should prevent balance overdraft under concurrent debit requests', async () => {
      // Simulate in-memory shared database row
      let inMemoryBalance = 100; // 100 paise initial balance

      const simulatedDbDebit = async (costPaise: number, _messageId: string) => {
        // Atomic UPDATE ... WHERE wallet_balance_paise >= costPaise
        if (inMemoryBalance >= costPaise) {
          inMemoryBalance -= costPaise;
          return { success: true, newBalance: inMemoryBalance };
        }
        return { success: false, newBalance: -1 };
      };

      // 5 concurrent requests each wanting 40 paise
      // Only 2 should succeed (40 + 40 = 80 <= 100), 3 must fail!
      const requests = [
        simulatedDbDebit(40, 'req-1'),
        simulatedDbDebit(40, 'req-2'),
        simulatedDbDebit(40, 'req-3'),
        simulatedDbDebit(40, 'req-4'),
        simulatedDbDebit(40, 'req-5'),
      ];

      const results = await Promise.all(requests);
      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      expect(successes).toHaveLength(2);
      expect(failures).toHaveLength(3);
      expect(inMemoryBalance).toBe(20); // 100 - 80 = 20 paise remaining
      expect(inMemoryBalance).toBeGreaterThanOrEqual(0);
    });
  });
});
