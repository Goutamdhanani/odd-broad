import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { IsInt, Min, Max } from 'class-validator';

export class CreateRechargeDto {
  @IsInt()
  @Min(10000, { message: 'Minimum recharge is ₹100 (10000 paise)' })
  @Max(1000000, { message: 'Maximum recharge is ₹10,000 (1000000 paise)' })
  amountPaise: number;
}

@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /api/wallet/recharge
   * Creates a Razorpay order for the requested recharge amount.
   * Requires authentication.
   */
  @Post('wallet/recharge')
  @UseGuards(AuthGuard('jwt'))
  async createRechargeOrder(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: CreateRechargeDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.paymentsService.createRechargeOrder(shopId, dto.amountPaise);
  }

  /**
   * POST /webhooks/razorpay
   * Receives Razorpay payment.captured webhooks.
   * No authentication — verified via HMAC signature.
   * Must be excluded from global API prefix (handled in main.ts).
   */
  @Post('webhooks/razorpay')
  @HttpCode(HttpStatus.OK)
  async handleRazorpayWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['x-razorpay-signature'] as string | undefined;

    // Use raw body for HMAC verification; fall back to stringified body
    let rawBody: string;
    if (req.rawBody) {
      rawBody = req.rawBody.toString('utf-8');
    } else {
      rawBody = JSON.stringify(req.body);
    }

    this.logger.log('Received Razorpay webhook');
    return this.paymentsService.handleWebhook(rawBody, signature);
  }
}
