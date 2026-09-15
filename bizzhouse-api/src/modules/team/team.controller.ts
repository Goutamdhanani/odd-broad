import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TeamService } from './team.service';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';

@Controller('team')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @Roles('shop_owner')
  async list(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) throw new BadRequestException('No shop associated with this account');
    return this.teamService.list(shopId);
  }

  @Post()
  @Roles('shop_owner')
  async invite(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: { email: string; password: string; name: string },
  ) {
    if (!shopId) throw new BadRequestException('No shop associated with this account');
    return this.teamService.invite(shopId, dto);
  }

  @Delete(':id')
  @Roles('shop_owner')
  async remove(@CurrentTenant('shopId') shopId: string, @Param('id') id: string) {
    if (!shopId) throw new BadRequestException('No shop associated with this account');
    return this.teamService.remove(shopId, id);
  }
}
