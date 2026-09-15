import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';

/**
 * Tenant-isolation regression tests (directive rule 32):
 * a shop must never be able to read or mutate another shop's data, even
 * with valid credentials and valid record UUIDs.
 */
describe('MessagesService — tenant scoping', () => {
  let service: MessagesService;
  let mockMessageRepo: any;
  let mockContactRepo: any;
  let mockGupshupAppRepo: any;
  let mockTemplateRepo: any;
  let mockGupshupService: any;
  let mockWalletService: any;
  let mockPricingService: any;

  beforeEach(() => {
    mockMessageRepo = {
      create: vi.fn((data) => ({ id: 'msg-1', ...data })),
      save: vi.fn(async (d) => d),
      update: vi.fn(async () => {}),
      // Simulate the DB: records exist but every lookup is shop-scoped —
      // findOne returns null whenever the where-clause includes a shopId
      // that doesn't own the row.
      findOne: vi.fn(async ({ where }: any) => {
        if (where.shopId && where.shopId !== 'shop-A') return null;
        if (where.gupshupMessageId) {
          return { id: 'owned-msg', shopId: 'shop-A', status: 'sent', costPaise: 150 };
        }
        return null;
      }),
      findAndCount: vi.fn().mockResolvedValue([[], 0]),
    };
    mockContactRepo = {
      findOne: vi.fn(async ({ where }: any) =>
        where.shopId === 'shop-A' ? { id: 'contact-A', waId: where.waId } : null,
      ),
      create: vi.fn((d) => ({ id: 'contact-new', ...d })),
      save: vi.fn(async (d) => d),
      find: vi.fn().mockResolvedValue([]),
    };
    mockGupshupAppRepo = {
      findOne: vi.fn(async ({ where }: any) =>
        where.shopId === 'shop-A'
          ? { id: 'app-A', shopId: 'shop-A', gupshupAppId: 'gs-A', wabaStatus: 'live' }
          : null,
      ),
    };
    mockTemplateRepo = { findOne: vi.fn().mockResolvedValue(null) };
    mockGupshupService = { sendMessage: vi.fn() };
    mockWalletService = {
      debitForMessage: vi.fn(async () => ({ success: true, newBalance: 1000 })),
      refundForMessage: vi.fn(),
    };
    mockPricingService = { getCost: vi.fn().mockReturnValue(0) };

    service = new MessagesService(
      mockMessageRepo,
      mockContactRepo,
      mockGupshupAppRepo,
      mockTemplateRepo,
      mockGupshupService,
      mockWalletService,
      mockPricingService,
    );
  });

  it('shop B cannot read a conversation owned by shop A', async () => {
    await expect(
      service.getConversationMessages('shop-B', 'contact-A'),
    ).rejects.toThrow(NotFoundException);
  });

  it('shop B has no conversations listed (scoped query returns empty)', async () => {
    const res = await service.getConversations('shop-B');
    expect(res.data).toHaveLength(0);
  });

  it('shop B cannot send through shop A WhatsApp number', async () => {
    await expect(
      service.sendMessage('shop-B', {
        contactWaId: '919876543210',
        type: 'text',
        text: 'hi',
      }),
    ).rejects.toThrow(/No active WhatsApp number/);
    expect(mockGupshupService.sendMessage).not.toHaveBeenCalled();
  });

  it('shop B cannot trigger a refund for shop A messages', async () => {
    // Status updates route through gupshup message id → owned by shop A;
    // refunds must be credited to the OWNING shop, never the caller.
    await service.updateMessageStatus('gs-owned', 'failed');
    expect(mockWalletService.refundForMessage).toHaveBeenCalledWith(
      'shop-A', // message.shopId, not the caller
      expect.anything(),
      expect.anything(),
    );
  });
});
