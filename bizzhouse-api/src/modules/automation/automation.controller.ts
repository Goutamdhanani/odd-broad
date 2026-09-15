import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AutomationService } from './automation.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';

@Controller('automation')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(TenantContextInterceptor)
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get()
  async list(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) throw new BadRequestException('No shop associated with this account');
    return this.automationService.list(shopId);
  }

  @Post()
  async create(
    @CurrentTenant('shopId') shopId: string,
    @Body()
    dto: { name: string; keyword: string; matchType?: string; replyText: string },
  ) {
    if (!shopId) throw new BadRequestException('No shop associated with this account');
    return this.automationService.create(shopId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      keyword?: string;
      matchType?: string;
      replyText?: string;
      enabled?: boolean;
    },
  ) {
    if (!shopId) throw new BadRequestException('No shop associated with this account');
    return this.automationService.update(shopId, id, dto);
  }

  @Delete(':id')
  async remove(@CurrentTenant('shopId') shopId: string, @Param('id') id: string) {
    if (!shopId) throw new BadRequestException('No shop associated with this account');
    return this.automationService.remove(shopId, id);
  }
}
