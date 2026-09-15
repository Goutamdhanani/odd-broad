import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentsService } from './payments.service';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('PaymentsService.handleWebhook (live signature verification)', () => {
  let service: PaymentsService;
  let mockWallet: any;
  const secret = 'test-webhook-secret';

  beforeEach(() => {
    const mockConfig: any = {
      get: vi.fn((key: string) => {
        const values: Record<string, any> = {
          'razorpay.keyId': 'rzp_test_123',
          'razorpay.keySecret': 'key-secret',
          'razorpay.webhookSecret': secret,
          'razorpay.mockMode': false,
        };
        return values[key];
      }),
    };
    mockWallet = {
      creditRecharge: vi.fn(async () => 75000),
      creditShop: vi.fn(),
    };
    service = new PaymentsService(mockConfig, mockWallet);
  });

  it('accepts a correctly signed payment.captured and credits the wallet', async () => {
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_live_1',
            amount: 50000,
            notes: { shopId: 'shop-1' },
          },
        },
      },
    });
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await service.handleWebhook(raw, sig);

    expect(res.processed).toBe(true);
    expect(mockWallet.creditRecharge).toHaveBeenCalledWith('shop-1', 50000, 'pay_live_1');
  });

  it('rejects a tampered payload', async () => {
    const raw = '{"event":"payment.captured"}';
    const sig = crypto.createHmac('sha256', secret).update('{"event":"other"}').digest('hex');

    await expect(service.handleWebhook(raw, sig)).rejects.toThrow(BadRequestException);
    expect(mockWallet.creditRecharge).not.toHaveBeenCalled();
  });

  it('rejects a missing signature', async () => {
    await expect(
      service.handleWebhook('{"event":"payment.captured"}', undefined),
    ).rejects.toThrow('Missing X-Razorpay-Signature header');
  });

  it('ignores non-captured events after verifying signature', async () => {
    const raw = JSON.stringify({ event: 'refund.processed' });
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await service.handleWebhook(raw, sig);
    expect(res.processed).toBe(false);
    expect(mockWallet.creditRecharge).not.toHaveBeenCalled();
  });

  it('returns processed:false when notes.shopId is missing', async () => {
    const raw = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_x', amount: 100, notes: {} } } },
    });
    const sig = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    const res = await service.handleWebhook(raw, sig);
    expect(res.processed).toBe(false);
    expect(mockWallet.creditRecharge).not.toHaveBeenCalled();
  });
});
