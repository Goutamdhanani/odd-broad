import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../wallet/wallet.service';

export interface RechargeOrder {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  mock: boolean;
}

/**
 * Handles wallet recharge via Razorpay.
 *
 * Mock mode (RAZORPAY_MOCK_MODE=true): no external calls; orders are
 * synthetic and payments are auto-captured — lets the whole recharge
 * loop be developed/tested without live keys.
 *
 * Live mode: creates real Razorpay orders and credits the wallet only
 * after HMAC-SHA256 signature verification of the payment.captured event.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly razorpay: any | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly walletService: WalletService,
  ) {
    const keyId = this.config.get<string>('razorpay.keyId');
    const keySecret = this.config.get<string>('razorpay.keySecret');
    const mockMode = this.config.get<boolean>('razorpay.mockMode');

    if (!mockMode && keyId && keySecret) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Razorpay = require('razorpay');
      this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      this.logger.log('Razorpay initialized in LIVE mode');
    } else {
      this.logger.warn(
        'Razorpay running in MOCK mode — recharges are simulated',
      );
    }
  }

  /**
   * Phase 23: create a Razorpay order for a requested recharge amount.
   */
  async createRechargeOrder(
    shopId: string,
    amountPaise: number,
  ): Promise<RechargeOrder> {
    if (!Number.isInteger(amountPaise) || amountPaise < 10000) {
      throw new BadRequestException(
        'Minimum recharge is ₹100 (amountPaise must be an integer >= 10000)',
      );
    }

    const mockMode = this.config.get<boolean>('razorpay.mockMode');
    const keyId = this.config.get<string>('razorpay.keyId');

    if (mockMode || !this.razorpay) {
      return {
        orderId: `order_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amountPaise,
        currency: 'INR',
        keyId: keyId || 'rzp_test_mock',
        mock: true,
      };
    }

    const order = await this.razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `recharge_${shopId.slice(0, 8)}_${Date.now()}`,
      notes: { shopId },
    });

    return {
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      keyId: keyId || '',
      mock: false,
    };
  }

  /**
   * Phase 24/25: verify a Razorpay webhook and credit the wallet on
   * a genuine payment.captured event. Idempotent per payment id.
   */
  async handleWebhook(rawBody: string, signature: string | undefined) {
    const webhookSecret = this.config.get<string>('razorpay.webhookSecret');
    const keyId = this.config.get<string>('razorpay.keyId');
    // No credentials configured = development environment: trust the
    // mock path rather than failing every webhook with a config error.
    const mockMode =
      this.config.get<boolean>('razorpay.mockMode') || !keyId;

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    // ─── Mock mode: signature optional, event trusted ────
    if (mockMode) {
      if (payload?.event !== 'payment.captured') {
        return { received: true, processed: false, reason: 'ignored-event' };
      }
      const { shopId, amountPaise, paymentId } = this.extractPayment(payload);
      if (!shopId) {
        throw new BadRequestException('Missing notes.shopId in mock payload');
      }
      if (!amountPaise || amountPaise <= 0) {
        throw new BadRequestException('Invalid payment amount');
      }
      const newBalance = await this.walletService.creditRecharge(
        shopId,
        amountPaise,
        paymentId,
      );
      return { received: true, processed: true, mock: true, newBalance };
    }

    // ─── Live mode: mandatory HMAC verification ──────────
    if (!signature) {
      throw new BadRequestException('Missing X-Razorpay-Signature header');
    }
    if (!webhookSecret) {
      throw new BadRequestException(
        'RAZORPAY_WEBHOOK_SECRET not configured',
      );
    }

    const crypto = await import('crypto');
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    if (payload?.event !== 'payment.captured') {
      return { received: true, processed: false, reason: 'ignored-event' };
    }

    const { shopId, amountPaise, paymentId } = this.extractPayment(payload);
    if (!shopId) {
      this.logger.error(
        `payment.captured ${paymentId} has no notes.shopId — cannot credit`,
      );
      return { received: true, processed: false, reason: 'missing-shop-id' };
    }
    if (!amountPaise || amountPaise <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    // Idempotent per payment id — Razorpay retries must not double-credit.
    const newBalance = await this.walletService.creditRecharge(
      shopId,
      amountPaise,
      paymentId,
    );

    this.logger.log(
      `Recharge credited: shop ${shopId} +${amountPaise} paise via ${paymentId}`,
    );
    return { received: true, processed: true, newBalance };
  }

  private extractPayment(payload: any): {
    shopId?: string;
    amountPaise: number;
    paymentId: string;
  } {
    const entity = payload?.payload?.payment?.entity || {};
    return {
      shopId: entity.notes?.shopId,
      amountPaise: Number(entity.amount) || 0,
      paymentId: entity.id || 'unknown',
    };
  }
}
