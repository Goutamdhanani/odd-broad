import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Shop } from '../shops/entities/shop.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { GupshupService } from '../gupshup/gupshup.service';
import { AlertService } from '../../shared/alert.service';
import { TemplatesService } from '../templates/templates.service';

@Injectable()
export class CronTasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronTasksService.name);
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    private readonly gupshupService: GupshupService,
    private readonly templatesService: TemplatesService,
    private readonly alertService: AlertService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing scheduled background tasks...');
    // Run immediate check, then schedule every 15 minutes
    this.runPeriodicTasks();
    this.checkInterval = setInterval(() => this.runPeriodicTasks(), 15 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  async runPeriodicTasks() {
    await this.checkUpstreamGupshupWallet();
    await this.checkShopLowBalances();
    await this.syncTemplateStatuses();
    await this.reconcileWalletLedgers();
  }

  /**
   * Template status reconciliation: poll the provider for every LIVE app
   * and update local rows whose status webhook was missed. Mock mode
   * returns no remote templates, so this is a no-op locally.
   */
  async syncTemplateStatuses() {
    const liveApps = await this.gupshupAppRepo.find({
      where: { wabaStatus: 'live' },
    });
    if (liveApps.length === 0) return;

    // Mock apps never exist upstream — skip them by app id prefix
    const realApps = liveApps.filter((a) => !a.gupshupAppId.startsWith('mock-'));
    if (realApps.length === 0) return;

    for (const app of realApps) {
      try {
        const updated = await this.templatesService.syncFromProvider(
          app.gupshupAppId,
          app.shopId,
        );
        if (updated > 0) {
          this.logger.log(
            `[TEMPLATE SYNC] App ${app.gupshupAppId}: ${updated} template(s) reconciled from provider`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `Template sync failed for app ${app.gupshupAppId}: ${err?.message}`,
        );
      }
    }
  }

  /**
   * Architecture doc §9.4: periodic reconciliation.
   * For every shop, the sum of its wallet_transactions must equal the
   * cached wallet_balance_paise on the shop row. Any drift is alerted
   * loudly — money correctness is belt-and-suspenders here.
   */
  async reconcileWalletLedgers() {
    try {
      const drifts = await this.shopRepo.query(`
        SELECT s.id,
               s.business_name,
               s.wallet_balance_paise,
               COALESCE(SUM(t.amount_paise), 0) AS ledger_sum
        FROM shops s
        LEFT JOIN wallet_transactions t ON t.shop_id = s.id
        GROUP BY s.id, s.business_name, s.wallet_balance_paise
        HAVING s.wallet_balance_paise <> COALESCE(SUM(t.amount_paise), 0)
      `);

      if (drifts.length === 0) {
        this.logger.log('[RECONCILE] All shop wallets match their ledgers');
        return;
      }

      for (const d of drifts) {
        const diff =
          Number(d.wallet_balance_paise) - Number(d.ledger_sum);
        this.logger.error(
          `⚠️ [RECONCILE DRIFT] Shop '${d.business_name}' (${d.id}): ` +
          `cached=${d.wallet_balance_paise} vs ledger=${d.ledger_sum} (diff=${diff})`,
        );
        await this.alertService.raise(
          `wallet-drift:${d.id}`,
          'critical',
          `Wallet ledger drift for shop '${d.business_name}': cached balance ` +
          `${d.wallet_balance_paise} paise vs ledger sum ${d.ledger_sum} paise (diff ${diff}). ` +
          `Investigate wallet_transactions before crediting this shop.`,
          { shopId: d.id, cached: d.wallet_balance_paise, ledger: d.ledger_sum },
          true, // drift is never routine — bypass cooldown
        );
      }
    } catch (err: any) {
      this.logger.error(`Wallet reconciliation failed: ${err.message}`);
    }
  }

  /**
   * Phase 58: Upstream Gupshup partner wallet balance check.
   * Threshold comes from GUPSHUP_WALLET_ALERT_THRESHOLD_USD (default $50),
   * deliberately far above Gupshup's own $5 email trigger so there's time
   * to recharge before every shop's sending starts failing at once.
   */
  async checkUpstreamGupshupWallet() {
    try {
      const res = await this.gupshupService.getWalletBalance();
      const balance = res?.balance ?? 0;
      const currency = res?.currency || 'USD';
      const threshold = this.config.get<number>('alerts.gupshupWalletThresholdUsd') ?? 50;

      if (balance < threshold) {
        await this.alertService.raise(
          'gupshup-wallet-low',
          'critical',
          `Upstream Gupshup Partner Wallet is LOW: ${balance} ${currency} remaining ` +
          `(threshold ${threshold}). Recharge at partner.gupshup.io — at zero, ALL shops' sending fails.`,
          { balance, currency, threshold },
        );
      } else {
        this.logger.log(`[HEALTH] Upstream Gupshup Partner Wallet: ${balance} ${currency}`);
      }
    } catch (err: any) {
      this.logger.error(`Failed upstream Gupshup wallet health check: ${err.message}`);
    }
  }

  /**
   * Phase 59: Shop low-balance alerts.
   * Threshold comes from SHOP_LOW_BALANCE_THRESHOLD_PAISE (default ₹5.00).
   * AlertService deduplicates per shop on a cooldown so active shops under
   * threshold don't re-alarm every 15 minutes.
   */
  async checkShopLowBalances() {
    try {
      const threshold = this.config.get<number>('alerts.shopLowBalanceThresholdPaise') ?? 500;

      const lowBalanceShops = await this.shopRepo.find({
        where: {
          status: 'active',
          walletBalancePaise: LessThan(threshold),
        },
      });

      for (const shop of lowBalanceShops) {
        const balanceRs = (Number(shop.walletBalancePaise) / 100).toFixed(2);
        await this.alertService.raise(
          `shop-low-balance:${shop.id}`,
          'warning',
          `Shop '${shop.businessName}' has low balance: ₹${balanceRs} ` +
          `(threshold ₹${(threshold / 100).toFixed(2)}). They can't send paid messages until they recharge.`,
          {
            shopId: shop.id,
            balancePaise: Number(shop.walletBalancePaise),
            thresholdPaise: threshold,
          },
        );
      }
    } catch (err: any) {
      this.logger.error(`Failed to check shop low balances: ${err.message}`);
    }
  }
}
