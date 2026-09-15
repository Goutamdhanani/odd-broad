import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShopsService } from './shops.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('shops')
@UseGuards(AuthGuard('jwt'))
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get('me/stats')
  async getMyShopStats(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.shopsService.getShopStats(shopId);
  }

  @Get('me/analytics')
  async getMyShopAnalytics(
    @CurrentTenant('shopId') shopId: string,
    @Query('days') days: number = 7,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.shopsService.getShopAnalytics(shopId, Number(days));
  }

  @Get('me')
  async getMyShop(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.shopsService.findById(shopId);
  }

  @Patch('me')
  @Roles('shop_owner')
  @UseGuards(RolesGuard)
  async updateMyShop(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: { businessName?: string; category?: string },
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.shopsService.update(shopId, dto);
  }

  // ─── Admin endpoints ────────────────────────────────
  // NOTE: declared before 'admin/:id' so the literal route wins.
  @Get('admin/stats')
  @Roles('super_admin')
  @UseGuards(RolesGuard)
  async platformStats() {
    return this.shopsService.getPlatformStats();
  }

  @Get('admin/all')
  @Roles('super_admin')
  @UseGuards(RolesGuard)
  async listAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.shopsService.findAll(page, limit);
  }

  @Get('admin/:id')
  @Roles('super_admin')
  @UseGuards(RolesGuard)
  async getShopById(@Param('id') id: string) {
    return this.shopsService.findById(id);
  }

  @Patch('admin/:id/status')
  @Roles('super_admin')
  @UseGuards(RolesGuard)
  async updateShopStatus(
    @Param('id') id: string,
    @Body() dto: { status: 'onboarding' | 'active' | 'suspended' },
  ) {
    return this.shopsService.updateStatus(id, dto.status);
  }
}
