import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';

describe('WebhooksController — admin ops', () => {
  let controller: WebhooksController;
  let mockQueue: any;
  let mockRepo: any;

  beforeEach(() => {
    mockQueue = { add: vi.fn().mockResolvedValue({}) };
    mockRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      save: vi.fn(async (d) => d),
    };
    controller = new WebhooksController(mockQueue, mockRepo, {
      get: vi.fn(() => ''),
    } as any);
  });

  describe('pendingEvents', () => {
    it('lists oldest unprocessed events with age in seconds', async () => {
      const old = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
      mockRepo.find.mockResolvedValue([
        { id: 'e-1', gupshupAppId: 'gs-1', eventType: 'message', receivedAt: old },
      ]);

      const res = await controller.pendingEvents();

      expect(res.count).toBe(1);
      expect(res.data[0].id).toBe('e-1');
      expect(res.data[0].ageSeconds).toBeGreaterThanOrEqual(1190);
      expect(res.data[0].ageSeconds).toBeLessThanOrEqual(1210);
      // ordered oldest-first, capped at 50
      expect(mockRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { processed: false },
          take: 50,
        }),
      );
    });
  });

  describe('replayEvent', () => {
    it('404s for an unknown event', async () => {
      await expect(controller.replayEvent('nope')).rejects.toThrow(NotFoundException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('re-enqueues the stored raw payload through the normal pipeline', async () => {
      const payload = { gs_app_id: 'gs-1', entry: [] };
      mockRepo.findOne.mockResolvedValue({
        id: 'e-1',
        rawPayload: payload,
        eventType: 'message',
      });

      const res = await controller.replayEvent('e-1');

      expect(res).toEqual({ replayed: true, id: 'e-1' });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process',
        expect.objectContaining({ payload, webhookEventId: 'e-1' }),
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });
});
