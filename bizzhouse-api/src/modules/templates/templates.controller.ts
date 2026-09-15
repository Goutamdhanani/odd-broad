import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';

@Controller('templates')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  async create(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.templatesService.create(shopId, dto);
  }

  @Get()
  async findAll(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.templatesService.findAllForShop(shopId);
  }

  @Get(':id')
  async findOne(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.templatesService.findOne(shopId, id);
  }
}
