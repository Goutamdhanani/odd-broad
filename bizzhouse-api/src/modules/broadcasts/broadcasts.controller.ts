import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';

@Controller('broadcasts')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(TenantContextInterceptor)
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Post()
  async create(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: CreateBroadcastDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.broadcastsService.create(shopId, dto);
  }

  @Get('estimate')
  async estimate(
    @CurrentTenant('shopId') shopId: string,
    @Query('tag') tag?: string,
    @Query('templateName') templateName?: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.broadcastsService.estimate(shopId, tag || undefined, templateName || undefined);
  }

  @Get()
  async list(
    @CurrentTenant('shopId') shopId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.broadcastsService.list(shopId, page, limit);
  }

  // Must precede ':id' — "stats" would otherwise be captured as the param.
  @Get(':id/stats')
  async deliveryStats(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.broadcastsService.deliveryStats(shopId, id);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.broadcastsService.cancel(shopId, id);
  }

  @Get(':id')
  async getOne(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.broadcastsService.getOne(shopId, id);
  }
}
