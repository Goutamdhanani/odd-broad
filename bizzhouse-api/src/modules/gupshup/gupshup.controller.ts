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
import { NumberHealthService } from './number-health.service';
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
    private readonly numberHealthService: NumberHealthService,
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
   * Every number this shop has connected, each with its composite health
   * (traffic light, quality rating, tier, 24h usage/failures) — spec §2.3/2.4.
   */
  @Get('numbers')
  async getNumbers(@CurrentTenant('shopId') shopId: string) {
    return { numbers: await this.numberHealthService.getShopNumbers(shopId) };
  }

  /**
   * On-demand ratings refresh. The Gupshup ratings API is rate-limited
   * (10 req/min) and moves ~daily, so an explicit cooldown guards it;
   * the scheduled poll remains the primary source.
   */
  @Post('numbers/ratings/refresh')
  async refreshRatings(@CurrentTenant('shopId') shopId: string) {
    const apps = await this.gupshupAppRepo.find({ where: { shopId } });
    const live = apps.filter((a) => a.wabaStatus === 'live');
    if (live.length === 0) {
      throw new BadRequestException('No live numbers to refresh ratings for');
    }
    const cooldownMs = 10 * 60 * 1000;
    const freshest = Math.max(
      ...live.map((a) => (a.lastRatingsCheck ? new Date(a.lastRatingsCheck).getTime() : 0)),
    );
    if (Date.now() - freshest < cooldownMs) {
      return { refreshed: false, reason: 'Ratings were checked recently — using cached values' };
    }
    await this.numberHealthService.pollRatings();
    return { refreshed: true, numbers: await this.numberHealthService.getShopNumbers(shopId) };
  }

  /**
   * Live WhatsApp connectivity snapshot for the shop's first live app.
   * Health lights for all numbers live under GET /gupshup/numbers.
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

  /**
   * Start onboarding another number. A shop can have many numbers
   * (spec §2.4): each call that finds no still-pending app creates a NEW
   * Gupshup app row; a pending app is resumed instead of duplicated.
   */
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

    // Resume an unfinished onboarding if one exists; otherwise add a number
    let app = await this.gupshupAppRepo.findOne({
      where: { shopId, wabaStatus: 'pending' },
    });

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
