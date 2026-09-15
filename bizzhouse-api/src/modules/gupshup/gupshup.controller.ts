import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GupshupApp } from './entities/gupshup-app.entity';
import { GupshupService } from './gupshup.service';
import { Shop } from '../shops/entities/shop.entity';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';

@Controller('gupshup')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class GupshupController {
  constructor(
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    private readonly gupshupService: GupshupService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  async getStatus(@CurrentTenant('shopId') shopId: string) {
    const shop = await this.shopRepo.findOne({ where: { id: shopId } });
    const app = await this.gupshupAppRepo.findOne({ where: { shopId } });

    return {
      shopStatus: shop?.status || 'onboarding',
      app: app
        ? {
            id: app.id,
            gupshupAppId: app.gupshupAppId,
            onboardingType: app.onboardingType,
            wabaStatus: app.wabaStatus,
            phoneNumber: app.phoneNumber,
            createdAt: app.createdAt,
          }
        : null,
    };
  }

  /**
   * Live WhatsApp connectivity snapshot for the shop's own app:
   * WABA health, Meta quality rating, and messaging tier where
   * the provider reports it. Mock mode returns clearly-labeled mocks.
   */
  @Get('quality')
  async getQuality(@CurrentTenant('shopId') shopId: string) {
    const shop = await this.shopRepo.findOne({ where: { id: shopId } });
    const app = await this.gupshupAppRepo.findOne({ where: { shopId } });
    if (!app) {
      return { connected: false, app: null, health: null, rating: null };
    }

    const [health, rating] = await Promise.all([
      this.gupshupService.getHealth(app.gupshupAppId).catch((err) => {
        return { error: err?.message };
      }),
      this.gupshupService.getRatings(app.gupshupAppId).catch((err) => {
        return { error: err?.message };
      }),
    ]);

    return {
      connected: app.wabaStatus === 'live',
      app: {
        gupshupAppId: app.gupshupAppId,
        wabaStatus: app.wabaStatus,
        phoneNumber: app.phoneNumber,
        onboardingType: app.onboardingType,
      },
      shopStatus: shop?.status || 'onboarding',
      health,
      rating,
    };
  }

  @Post('onboard')
  async startOnboarding(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: { onboardingType: 'new_number' | 'existing_number'; phoneNumber?: string },
  ) {
    const shop = await this.shopRepo.findOne({ where: { id: shopId } });
    if (!shop) throw new BadRequestException('Shop not found');
    if (!dto.onboardingType) {
      throw new BadRequestException('onboardingType is required (new_number or existing_number)');
    }

    let app = await this.gupshupAppRepo.findOne({ where: { shopId } });

    if (!app) {
      const sanitizedAppName = `${shop.slug.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;
      const appRes = await this.gupshupService.createApp(sanitizedAppName);

      app = this.gupshupAppRepo.create({
        shopId,
        gupshupAppId: appRes.appId,
        onboardingType: dto.onboardingType,
        phoneNumber: dto.phoneNumber || null,
        wabaStatus: 'pending',
      });
      await this.gupshupAppRepo.save(app);
    } else if (app.onboardingType !== dto.onboardingType) {
      // Keep the stored path in sync if the shop switches flows mid-onboarding
      app.onboardingType = dto.onboardingType;
      if (dto.phoneNumber) app.phoneNumber = dto.phoneNumber;
      await this.gupshupAppRepo.save(app);
    }

    // Existing-number path: flag the app for migration BEFORE generating
    // the embed link so Meta/Gupshup expect the handover (doc §8.4).
    if (dto.onboardingType === 'existing_number') {
      try {
        await this.gupshupService.markForMigration(app.gupshupAppId);
      } catch (err: any) {
        throw new BadRequestException(
          `Could not mark number for migration: ${err?.message}. The number may still be active on the WhatsApp Business app or another BSP.`,
        );
      }
    }

    // Register the v3 callback subscription (best-effort here — the app
    // token may not be live until the WABA finishes embedded signup; the
    // webhook processor re-registers when the app flips LIVE).
    setImmediate(() => {
      this.ensureSubscription(app.gupshupAppId).catch(() => {});
    });

    const embedRes = await this.gupshupService.getEmbedSignupLink(
      app.gupshupAppId,
      shop.businessName,
    );

    return {
      appId: app.gupshupAppId,
      onboardingType: app.onboardingType,
      wabaStatus: app.wabaStatus,
      embedSignupLink: embedRes.link,
    };
  }

  /** Idempotently register the Gupshup v3 callback subscription. */
  private async ensureSubscription(gupshupAppId: string) {
    const alreadyLive = await this.gupshupService.hasActiveSubscription(gupshupAppId);
    if (alreadyLive) return;
    const callbackUrl = `${this.config.get<string>('gupshup.callbackBaseUrl')}/webhooks/gupshup`;
    await this.gupshupService.setSubscription(gupshupAppId, callbackUrl);
  }
}
