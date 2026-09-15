import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { GupshupApp } from './entities/gupshup-app.entity';
import { Message } from '../messages/entities/message.entity';
import { GupshupService } from './gupshup.service';

export type HealthLight = 'green' | 'yellow' | 'red';

export interface NumberHealth {
  light: HealthLight;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | null;
  messagingTier: string | null;
  dailyCeiling: number;
  sentLast24h: number;
  usageRatio: number;
  failureRateLast24h: number;
  reasons: string[];
}

/** Meta daily messaging limits per tier (spec §3.6). */
const TIER_CEILINGS: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY,
};

export function tierCeiling(tier: string | null | undefined): number {
  if (!tier) return TIER_CEILINGS.TIER_250; // unverified default — conservative
  if (tier in TIER_CEILINGS) return TIER_CEILINGS[tier];
  const match = tier.match(/TIER_(\d+)([KM])?/i);
  if (match) {
    const base = parseInt(match[1], 10);
    if (match[2]?.toUpperCase() === 'K') return base * 1_000;
    if (match[2]?.toUpperCase() === 'M') return base * 1_000_000;
    return base;
  }
  return TIER_CEILINGS.TIER_250;
}

/**
 * Number health (spec §2.3) + multi-number routing (spec §2.4).
 *
 * The health score combines Meta's real quality rating (polled on a
 * schedule — never per-message) with BizzHouse's own 24h failure rate
 * and send volume vs the number's tier ceiling. Shops see a traffic
 * light; the router only ever picks green/yellow numbers.
 */
@Injectable()
export class NumberHealthService {
  private readonly logger = new Logger(NumberHealthService.name);

  constructor(
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly gupshupService: GupshupService,
  ) {}

  /**
   * Scheduled ratings poll — the ONLY place that calls the (rate-limited)
   * Gupshup ratings API. Caches quality + tier on the app row. "no event
   * update available" is normal and keeps existing cached values.
   */
  async pollRatings(app?: GupshupApp): Promise<void> {
    const apps = app
      ? [app]
      : await this.gupshupAppRepo.find({ where: { wabaStatus: 'live' } });

    for (const a of apps) {
      try {
        const res = await this.gupshupService.getRatings(a.gupshupAppId);
        const patch: Partial<GupshupApp> = { lastRatingsCheck: new Date() };
        if (res?.phoneQuality && ['GREEN', 'YELLOW', 'RED'].includes(res.phoneQuality)) {
          patch.qualityRating = res.phoneQuality as 'GREEN' | 'YELLOW' | 'RED';
        }
        if (res?.currentLimit) patch.messagingTier = res.currentLimit;
        await this.gupshupAppRepo.update(a.id, patch);
      } catch (err: any) {
        this.logger.warn(`Ratings poll failed for ${a.gupshupAppId}: ${err?.message}`);
      }
    }
  }

  /** Own-side 24h stats for one number, straight from the messages table. */
  private async last24hStats(gupshupAppId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await this.messageRepo.find({
      select: { status: true },
      where: { gupshupAppId, direction: 'outbound', createdAt: MoreThanOrEqual(since) },
    });
    const sent = rows.length;
    const failed = rows.filter((r) => r.status === 'failed').length;
    return { sent, failed, failureRate: sent > 0 ? failed / sent : 0 };
  }

  /** Composite health for one number (spec §2.3's exact combination). */
  async getHealth(app: GupshupApp): Promise<NumberHealth> {
    const stats = await this.last24hStats(app.gupshupAppId);
    const ceiling = tierCeiling(app.messagingTier);
    const usageRatio = Number.isFinite(ceiling) && ceiling > 0 ? stats.sent / ceiling : 0;

    const reasons: string[] = [];
    let light: HealthLight = 'green';

    // 1. Meta's own quality rating — the authoritative ban/throttle signal
    if (app.qualityRating === 'RED') {
      light = 'red';
      reasons.push('Meta quality rating is RED — WhatsApp is throttling or about to ban this number');
    } else if (app.qualityRating === 'YELLOW') {
      light = 'yellow';
      reasons.push('Meta quality rating is YELLOW');
    }

    // 2. Own 24h failure rate — early warning before Meta's rating moves
    if (stats.sent >= 20 && stats.failureRate > 0.3) {
      light = 'red';
      reasons.push(`${Math.round(stats.failureRate * 100)}% of sends failed in the last 24h`);
    } else if (stats.sent >= 20 && stats.failureRate > 0.1 && light !== 'red') {
      light = 'yellow';
      reasons.push(`${Math.round(stats.failureRate * 100)}% of sends failed in the last 24h`);
    }

    // 3. Volume vs tier ceiling — warn at Meta's own recommended 70-80%
    if (usageRatio >= 1) {
      light = 'red';
      reasons.push(`Daily send limit reached (${stats.sent}/${ceiling} for ${app.messagingTier ?? 'TIER_250'})`);
    } else if (usageRatio >= 0.7 && light !== 'red') {
      light = 'yellow';
      reasons.push(`${Math.round(usageRatio * 100)}% of the daily send limit used (${stats.sent}/${ceiling})`);
    }

    return {
      light,
      qualityRating: (app.qualityRating as NumberHealth['qualityRating']) ?? null,
      messagingTier: app.messagingTier ?? null,
      dailyCeiling: ceiling,
      sentLast24h: stats.sent,
      usageRatio: Number.isFinite(usageRatio) ? Number(usageRatio.toFixed(3)) : 0,
      failureRateLast24h: Number(stats.failureRate.toFixed(3)),
      reasons,
    };
  }

  /**
   * Health snapshot for every number a shop has connected (traffic light
   * + the raw inputs, for the UI).
   */
  async getShopNumbers(shopId: string) {
    const apps = await this.gupshupAppRepo.find({
      where: { shopId },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(
      apps.map(async (app) => {
        const health = await this.getHealth(app);
        return {
          id: app.id,
          gupshupAppId: app.gupshupAppId,
          phoneNumber: app.phoneNumber,
          wabaStatus: app.wabaStatus,
          onboardingType: app.onboardingType,
          health,
        };
      }),
    );
  }

  /**
   * Routing (spec §2.4): pick the sending number for a shop.
   * A pinned app is honored (verified healthy-ish); otherwise prefer the
   * healthy number furthest from its daily tier ceiling.
   */
  async pickSendingNumber(shopId: string, pinnedAppId?: string | null): Promise<GupshupApp> {
    if (pinnedAppId) {
      const pinned = await this.gupshupAppRepo.findOne({
        where: { gupshupAppId: pinnedAppId, shopId, wabaStatus: 'live' },
      });
      if (!pinned) {
        throw new Error(`Pinned sending number ${pinnedAppId} is not a live number of this shop`);
      }
      const health = await this.getHealth(pinned);
      if (health.light === 'red') {
        throw new Error(
          `Pinned sending number is unhealthy: ${health.reasons.join('; ')}. ` +
            `Pick another number or wait for its rating to recover.`,
        );
      }
      return pinned;
    }

    const apps = await this.gupshupAppRepo.find({
      where: { shopId, wabaStatus: 'live' },
    });
    if (apps.length === 0) {
      throw new Error('No live WhatsApp number found. Complete onboarding first.');
    }

    const scored: Array<{ app: GupshupApp; health: NumberHealth }> = [];
    for (const app of apps) {
      scored.push({ app, health: await this.getHealth(app) });
    }

    // Never route to a red number on our own initiative
    const eligible = scored.filter((s) => s.health.light !== 'red');
    if (eligible.length === 0) {
      throw new Error(
        'All connected numbers are currently unhealthy (quality/limits/failures). ' +
          'Connect a new number or wait for ratings to recover before broadcasting.',
      );
    }

    // Prefer the number furthest from its tier ceiling (lowest usage ratio)
    eligible.sort((a, b) => a.health.usageRatio - b.health.usageRatio);
    return eligible[0].app;
  }

  /**
   * Mid-campaign guard (spec §2.4 step 3): called between batches — NOT
   * per message. Returns false when the number must not continue.
   */
  async canContinueSending(app: GupshupApp): Promise<{ ok: boolean; reasons: string[] }> {
    const health = await this.getHealth(app);
    return { ok: health.light !== 'red', reasons: health.reasons };
  }
}
