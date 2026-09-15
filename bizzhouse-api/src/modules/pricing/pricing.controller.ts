import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PricingService } from '../../shared/pricing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

/**
 * Platform pricing (rate card) — super-admin only. Prices are stored in
 * the rate_cards table and resolved at send time, so changes take effect
 * without a deploy.
 */
@Controller('pricing')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  @Roles('super_admin')
  getPrices() {
    return { prices: this.pricingService.getPriceTable() };
  }

  @Patch()
  @Roles('super_admin')
  async updatePrices(@Body() dto: { prices: Record<string, number> }) {
    if (!dto?.prices || typeof dto.prices !== 'object') {
      throw new BadRequestException('prices object is required (key "category:COUNTRY" → paise)');
    }
    for (const [key, value] of Object.entries(dto.prices)) {
      if (!/^[a-z]+:(IN|DEFAULT)$/.test(key)) {
        throw new BadRequestException(
          `Invalid price key '${key}'. Expected format category:COUNTRY (e.g. marketing:IN).`,
        );
      }
      if (!Number.isInteger(value) || value < 0) {
        throw new BadRequestException(`Price for '${key}' must be a non-negative integer of paise.`);
      }
    }
    await this.pricingService.updatePrices(dto.prices);
    return { prices: this.pricingService.getPriceTable() };
  }
}
