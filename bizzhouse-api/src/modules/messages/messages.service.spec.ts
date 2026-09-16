import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let mockMessageRepo: any;
  let mockContactRepo: any;
  let mockGupshupAppRepo: any;
  let mockTemplateRepo: any;
  let mockGupshupService: any;
  let mockNumberHealthService: any;
  let mockWalletService: any;
  let mockPricingService: any;

  beforeEach(() => {
    mockMessageRepo = {
      create: vi.fn((data) => ({ id: 'msg-uuid-1', ...data })),
      save: vi.fn(async (data) => data),
      update: vi.fn(async () => {}),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      count: vi.fn(),
      query: vi.fn(),
    };

    mockContactRepo = {
      findOne: vi.fn(),
      create: vi.fn((data) => ({ id: 'contact-uuid-1', ...data })),
      save: vi.fn(async (data) => data),
      find: vi.fn(),
    };

    mockGupshupAppRepo = {
      findOne: vi.fn(),
    };

    mockTemplateRepo = {
      findOne: vi.fn(),
    };

    mockGupshupService = {
      sendMessage: vi.fn(),
    };

    mockNumberHealthService = {
      // Routing stub: resolves the app the test queued in mockGupshupAppRepo
      pickSendingNumber: vi.fn(async () => {
        const app = await mockGupshupAppRepo.findOne();
        if (!app) {
          throw new Error('No active WhatsApp number found. Complete onboarding first.');
        }
        return app;
      }),
    };

    mockWalletService = {
      debitForMessage: vi.fn(),
      refundForMessage: vi.fn(),
    };

    mockPricingService = {
      getCost: vi.fn().mockReturnValue(150), // 150 paise
    };

    service = new MessagesService(
      mockMessageRepo,
      mockContactRepo,
      mockGupshupAppRepo,
      mockTemplateRepo,
      mockGupshupService,
      mockNumberHealthService,
      mockWalletService,
      mockPricingService,
    );
  });

  describe('sendMessage', () => {
    it('should throw BadRequestException if shop has no live Gupshup app', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue(null);

      await expect(
        service.sendMessage('shop-1', {
          contactWaId: '919876543210',
          type: 'text',
          text: 'Hello!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException and mark failed if wallet balance is insufficient', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      mockContactRepo.findOne.mockResolvedValue({ id: 'c-1', waId: '919876543210', lastInboundAt: new Date() });
      mockWalletService.debitForMessage.mockResolvedValue({ success: false, newBalance: -1 });

      await expect(
        service.sendMessage('shop-1', {
          contactWaId: '919876543210',
          type: 'text',
          text: 'Hello!',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg-uuid-1', { status: 'failed' });
      expect(mockGupshupService.sendMessage).not.toHaveBeenCalled();
    });

    it('should debit wallet, send via Gupshup, and update message status to sent', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      mockContactRepo.findOne.mockResolvedValue({ id: 'c-1', waId: '919876543210', lastInboundAt: new Date() });
      mockWalletService.debitForMessage.mockResolvedValue({ success: true, newBalance: 850 });
      mockGupshupService.sendMessage.mockResolvedValue({
        messages: [{ id: 'gupshup-msg-123' }],
      });

      const result = await service.sendMessage('shop-1', {
        contactWaId: '919876543210',
        type: 'text',
        text: 'Hello!',
      });

      expect(result.status).toBe('sent');
      expect(result.gupshupMessageId).toBe('gupshup-msg-123');
      expect(mockWalletService.debitForMessage).toHaveBeenCalledWith('shop-1', 150, 'msg-uuid-1');
      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg-uuid-1', {
        status: 'sent',
        gupshupMessageId: 'gupshup-msg-123',
      });
    });

    it('should refund wallet and mark message failed if Gupshup send throws error', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      mockContactRepo.findOne.mockResolvedValue({ id: 'c-1', waId: '919876543210', lastInboundAt: new Date() });
      mockWalletService.debitForMessage.mockResolvedValue({ success: true, newBalance: 850 });
      mockGupshupService.sendMessage.mockRejectedValue(new Error('Gupshup API 500 error'));

      await expect(
        service.sendMessage('shop-1', {
          contactWaId: '919876543210',
          type: 'text',
          text: 'Hello!',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockWalletService.refundForMessage).toHaveBeenCalledWith('shop-1', 150, 'msg-uuid-1');
      expect(mockMessageRepo.update).toHaveBeenCalledWith('msg-uuid-1', { status: 'failed' });
    });

    it('should send media by mediaId and persist the preview URL for history rendering', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      mockContactRepo.findOne.mockResolvedValue({ id: 'c-1', waId: '919876543210', lastInboundAt: new Date() });
      mockWalletService.debitForMessage.mockResolvedValue({ success: true, newBalance: 850 });
      mockGupshupService.sendMessage.mockResolvedValue({
        messages: [{ id: 'gupshup-msg-media' }],
      });

      const result = await service.sendMessage('shop-1', {
        contactWaId: '919876543210',
        type: 'image',
        mediaId: '1852559851913765',
        mediaPreviewUrl: '/api/media/shops/shop-1/outbound/x.jpg',
        caption: 'New arrival!',
        contactName: 'Pooja',
      });

      expect(result.status).toBe('sent');
      // Provider got the id-based Meta shape, never the internal preview URL
      expect(mockGupshupService.sendMessage).toHaveBeenCalledWith(
        'gs-app-1',
        '919876543210',
        'image',
        { id: '1852559851913765', caption: 'New arrival!' },
      );
      // Stored row keeps the durable preview for UI rendering
      const stored = mockMessageRepo.create.mock.calls[0][0];
      expect(stored.payload.mediaUrl).toBe('/api/media/shops/shop-1/outbound/x.jpg');
      expect(stored.payload.caption).toBe('New arrival!');
    });

    it('should block media sends outside the 24h session window (Meta rule)', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      mockContactRepo.findOne.mockResolvedValue({
        id: 'c-1',
        waId: '919876543210',
        lastInboundAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        optedIn: true,
      });

      await expect(
        service.sendMessage('shop-1', {
          contactWaId: '919876543210',
          type: 'image',
          mediaId: '1852559851913765',
        }),
      ).rejects.toThrow(/24-hour session window/);

      expect(mockGupshupService.sendMessage).not.toHaveBeenCalled();
    });

    it('should reject media with neither mediaId nor mediaUrl', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      mockContactRepo.findOne.mockResolvedValue({ id: 'c-1', waId: '919876543210', lastInboundAt: new Date() });

      await expect(
        service.sendMessage('shop-1', {
          contactWaId: '919876543210',
          type: 'image',
        }),
      ).rejects.toThrow(/mediaId or mediaUrl/);
    });

    it('should reject template send outside session window when contact has not opted in (Meta policy)', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      // Session window closed: last inbound 3 days ago, no opt-in recorded
      mockContactRepo.findOne.mockResolvedValue({
        id: 'c-1',
        waId: '919876543210',
        lastInboundAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        optedIn: false,
      });

      await expect(
        service.sendMessage('shop-1', {
          contactWaId: '919876543210',
          type: 'template',
          templateName: 'festive_offer_v2',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockWalletService.debitForMessage).not.toHaveBeenCalled();
      expect(mockGupshupService.sendMessage).not.toHaveBeenCalled();
    });

    it('should allow template send outside session window when contact HAS opted in, priced by template category', async () => {
      mockGupshupAppRepo.findOne.mockResolvedValue({
        id: 'app-1',
        shopId: 'shop-1',
        gupshupAppId: 'gs-app-1',
        wabaStatus: 'live',
      });
      mockContactRepo.findOne.mockResolvedValue({
        id: 'c-1',
        waId: '919876543210',
        lastInboundAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        optedIn: true,
        optedInAt: new Date(),
      });
      mockTemplateRepo.findOne.mockResolvedValue({
        elementName: 'order_update',
        category: 'UTILITY',
        status: 'APPROVED',
      });
      mockPricingService.getCost.mockReturnValue(30); // utility:IN
      mockWalletService.debitForMessage.mockResolvedValue({ success: true, newBalance: 470 });
      mockGupshupService.sendMessage.mockResolvedValue({
        messages: [{ id: 'gupshup-msg-999' }],
      });

      const result = await service.sendMessage('shop-1', {
        contactWaId: '919876543210',
        type: 'template',
        templateName: 'order_update',
      });

      expect(result.status).toBe('sent');
      expect(mockPricingService.getCost).toHaveBeenCalledWith('utility', 'IN');
      expect(mockWalletService.debitForMessage).toHaveBeenCalledWith('shop-1', 30, 'msg-uuid-1');
    });
  });

  describe('getConversations — batched (no per-contact queries)', () => {
    it('fetches last-message + unread counts in two batched queries', async () => {
      mockContactRepo.find.mockResolvedValue([
        {
          id: 'c-1',
          waId: '919876543211',
          name: 'Pooja',
          optedIn: true,
          tags: ['vip'],
          lastInboundAt: new Date(),
          assignedUserId: null,
        },
        {
          id: 'c-2',
          waId: '919876543212',
          name: 'Rahul',
          optedIn: false,
          tags: [],
          lastInboundAt: null,
          assignedUserId: null,
        },
      ]);
      mockMessageRepo.query
        .mockResolvedValueOnce([
          {
            id: 'm-1',
            contact_id: 'c-1',
            direction: 'inbound',
            message_type: 'text',
            status: 'delivered',
            payload: { body: 'Hi there' },
            created_at: new Date('2026-09-15T10:00:00Z'),
          },
        ])
        .mockResolvedValueOnce([{ contact_id: 'c-1', unread: '3' }]);

      const result = await service.getConversations('shop-1');

      // exactly the two aggregate queries — no per-contact findOne/count
      expect(mockMessageRepo.query).toHaveBeenCalledTimes(2);
      expect(mockMessageRepo.findOne).not.toHaveBeenCalled();
      expect(mockMessageRepo.count).not.toHaveBeenCalled();

      const c1 = result.data.find((d: any) => d.contact.id === 'c-1');
      expect(c1.lastMessage.id).toBe('m-1');
      expect(c1.lastMessage.messageType).toBe('text'); // snake_case → camelCase
      expect(c1.unreadCount).toBe(3);
      expect(c1.contact.sessionOpen).toBe(true);

      const c2 = result.data.find((d: any) => d.contact.id === 'c-2');
      expect(c2.lastMessage).toBeNull();
      expect(c2.unreadCount).toBe(0);
      expect(c2.contact.sessionOpen).toBe(false);
    });

    it('runs no aggregate queries when the page has no contacts', async () => {
      mockContactRepo.find.mockResolvedValue([]);
      const result = await service.getConversations('shop-1');
      expect(result.data).toEqual([]);
      expect(mockMessageRepo.query).not.toHaveBeenCalled();
    });
  });

  describe('storeInboundMessage — webhook retry dedupe', () => {
    it('skips insert when the same wamid was already stored', async () => {
      const stored = { id: 'msg-existing', gupshupMessageId: 'wamid-1' };
      mockMessageRepo.findOne.mockResolvedValue(stored);

      const result = await service.storeInboundMessage(
        'shop-1',
        'contact-1',
        'wamid-1',
        'text',
        { body: 'hello' },
      );

      expect(result).toBe(stored);
      expect(mockMessageRepo.save).not.toHaveBeenCalled();
    });

    it('inserts when no prior row exists', async () => {
      mockMessageRepo.findOne.mockResolvedValue(null);
      mockMessageRepo.save.mockImplementation(async (d) => d);

      const result = await service.storeInboundMessage(
        'shop-1',
        'contact-1',
        'wamid-new',
        'text',
        { body: 'hi' },
      );

      expect(mockMessageRepo.save).toHaveBeenCalledTimes(1);
      expect(result.gupshupMessageId).toBe('wamid-new');
    });

    it('falls back to the winning row when a concurrent retry wins the race', async () => {
      const winner = { id: 'msg-winner', gupshupMessageId: 'wamid-2' };
      mockMessageRepo.findOne
        .mockResolvedValueOnce(null) // pre-check: nothing yet
        .mockResolvedValueOnce(winner); // post-violation: race winner exists
      mockMessageRepo.save.mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      const result = await service.storeInboundMessage(
        'shop-1',
        'contact-1',
        'wamid-2',
        'text',
        { body: 'hi' },
      );

      expect(result).toBe(winner);
    });

    it('rethrows non-duplicate save failures', async () => {
      mockMessageRepo.findOne.mockResolvedValue(null);
      mockMessageRepo.save.mockRejectedValueOnce(new Error('db gone'));

      await expect(
        service.storeInboundMessage('shop-1', 'c-1', 'wamid-x', 'text', {}),
      ).rejects.toThrow('db gone');
    });
  });

  describe('updateMessageStatus', () => {
    it('should progress message status forward', async () => {
      mockMessageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        status: 'queued',
        shopId: 'shop-1',
        costPaise: 150,
      });

      await service.updateMessageStatus('gs-id-1', 'sent');

      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'sent' }),
      );
    });

    it('should not regress status if an older status update arrives', async () => {
      mockMessageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        status: 'delivered',
        shopId: 'shop-1',
        costPaise: 150,
      });

      await service.updateMessageStatus('gs-id-1', 'sent');

      // save should NOT be called with status: 'sent'
      expect(mockMessageRepo.save).not.toHaveBeenCalled();
    });

    it('should trigger refund when status transitions to failed', async () => {
      mockMessageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        status: 'sent',
        shopId: 'shop-1',
        costPaise: 150,
        payload: { body: 'hi' },
      });

      await service.updateMessageStatus('gs-id-1', 'failed');

      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(mockWalletService.refundForMessage).toHaveBeenCalledWith('shop-1', 150, 'msg-1');
    });

    it('should persist the webhook failure reason (code + title) on failed messages', async () => {
      mockMessageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        status: 'sent',
        shopId: 'shop-1',
        costPaise: 0,
        payload: { body: 'hi' },
      });

      await service.updateMessageStatus('gs-id-1', 'failed', {
        code: 131047,
        title: 'Re-engagement message required',
      });

      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          payload: {
            body: 'hi',
            failureReason: { code: 131047, title: 'Re-engagement message required' },
          },
        }),
      );
    });

    it('should keep the payload untouched when a failure carries no error detail', async () => {
      mockMessageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        status: 'sent',
        shopId: 'shop-1',
        costPaise: 0,
        payload: { body: 'hi' },
      });

      await service.updateMessageStatus('gs-id-1', 'failed');

      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', payload: { body: 'hi' } }),
      );
    });

    it('should be idempotent and not re-refund if message is already failed', async () => {
      mockMessageRepo.findOne.mockResolvedValue({
        id: 'msg-1',
        status: 'failed',
        shopId: 'shop-1',
        costPaise: 150,
      });

      await service.updateMessageStatus('gs-id-1', 'failed');

      // Already failed: early return, no save, no refund call
      expect(mockWalletService.refundForMessage).not.toHaveBeenCalled();
      expect(mockMessageRepo.save).not.toHaveBeenCalled();
    });
  });
});
