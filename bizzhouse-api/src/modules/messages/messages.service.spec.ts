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
  let mockWalletService: any;
  let mockPricingService: any;

  beforeEach(() => {
    mockMessageRepo = {
      create: vi.fn((data) => ({ id: 'msg-uuid-1', ...data })),
      save: vi.fn(async (data) => data),
      update: vi.fn(async () => {}),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
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
      });

      await service.updateMessageStatus('gs-id-1', 'failed');

      expect(mockMessageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(mockWalletService.refundForMessage).toHaveBeenCalledWith('shop-1', 150, 'msg-1');
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
