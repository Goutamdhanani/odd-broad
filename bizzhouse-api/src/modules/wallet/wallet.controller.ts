import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { WalletService } from './wallet.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminCreditDto } from '../auth/dto/auth.dto';

@Controller('wallet')
@UseGuards(AuthGuard('jwt'))
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  async getBalance(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    const balance = await this.walletService.getBalance(shopId);
    return { shopId, balancePaise: balance };
  }

  @Get('transactions')
  async getTransactions(
    @CurrentTenant('shopId') shopId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.walletService.getTransactions(shopId, page, limit);
  }

  @Get('transactions/export')
  async exportTransactions(
    @Res() res: Response,
    @CurrentTenant('shopId') shopId: string,
    @Query('days') days?: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    const csv = await this.walletService.exportCsv(shopId, parseInt(days || '90', 10) || 90);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bizzhouse-wallet-${Date.now()}.csv"`,
    );
    res.send('\uFEFF' + csv);
  }

  // ─── Admin: manual wallet credit & debit ─────────────
  @Post('admin/credit')
  @Roles('super_admin')
  @UseGuards(RolesGuard)
  async adminCredit(@Body() dto: AdminCreditDto) {
    return this.walletService.creditShop(
      dto.shopId,
      dto.amountPaise,
      dto.description,
    );
  }

  @Post('admin/debit')
  @Roles('super_admin')
  @UseGuards(RolesGuard)
  async adminDebit(@Body() dto: AdminCreditDto) {
    return this.walletService.debitShop(
      dto.shopId,
      dto.amountPaise,
      dto.description,
    );
  }
}
