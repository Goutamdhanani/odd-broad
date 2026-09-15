import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shop } from './entities/shop.entity';

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
  ) {}

  async findById(id: string) {
    const shop = await this.shopRepo.findOne({
      where: { id },
      relations: { gupshupApps: true },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return {
      ...shop,
      walletBalancePaise: Number(shop.walletBalancePaise),
    };
  }

  /**
   * Real per-shop dashboard metrics — every number from SQL, scoped to the
   * shop, no hardcoded values anywhere.
   */
  async getShopStats(shopId: string) {
    const [shopRow, messageRows, contactRow, templateRows, broadcastRow, gupshupApp] =
      await Promise.all([
        this.shopRepo.query(
          `SELECT wallet_balance_paise, status, business_name FROM shops WHERE id = $1`,
          [shopId],
        ),
        this.shopRepo.query(
          `SELECT
             COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at > now() - interval '7 days')::int AS outbound_7d,
             COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at > now() - interval '7 days')::int AS inbound_7d,
             COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'failed')::int AS failed_total,
             COUNT(*) FILTER (WHERE direction = 'outbound' AND status IN ('sent','delivered','read'))::int AS sent_total,
             COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'read')::int AS read_total
           FROM messages WHERE shop_id = $1`,
          [shopId],
        ),
        this.shopRepo.query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE opted_in = true)::int AS opted_in,
             COUNT(*) FILTER (WHERE last_inbound_at > now() - interval '24 hours')::int AS active_24h
           FROM contacts WHERE shop_id = $1`,
          [shopId],
        ),
        this.shopRepo.query(
          `SELECT status, COUNT(*)::int AS count FROM templates WHERE shop_id = $1 GROUP BY status`,
          [shopId],
        ),
        this.shopRepo.query(
          `SELECT COUNT(*) FILTER (WHERE status IN ('queued','sending'))::int AS active
           FROM broadcasts WHERE shop_id = $1`,
          [shopId],
        ),
        this.shopRepo.query(
          `SELECT waba_status, phone_number FROM gupshup_apps WHERE shop_id = $1 LIMIT 1`,
          [shopId],
        ),
      ]);

    const shop = shopRow[0] || {};
    const messages = messageRows[0] || {};
    const contacts = contactRow[0] || {};
    const broadcasts = broadcastRow[0] || {};
    const app = gupshupApp[0] || {};

    const templatesByStatus: Record<string, number> = {};
    for (const row of templateRows) templatesByStatus[row.status] = Number(row.count);

    const sentTotal = Number(messages.sent_total || 0);
    const readTotal = Number(messages.read_total || 0);

    return {
      shop: {
        businessName: shop.business_name,
        status: shop.status,
        walletBalancePaise: Number(shop.wallet_balance_paise || 0),
      },
      whatsapp: {
        connected: app.waba_status === 'live',
        phoneNumber: app.phone_number || null,
      },
      messages: {
        outboundLast7d: Number(messages.outbound_7d || 0),
        inboundLast7d: Number(messages.inbound_7d || 0),
        sentTotal,
        readTotal,
        failedTotal: Number(messages.failed_total || 0),
        readRate: sentTotal > 0 ? Math.round((readTotal / sentTotal) * 100) : null,
      },
      contacts: {
        total: Number(contacts.total || 0),
        optedIn: Number(contacts.opted_in || 0),
        activeLast24h: Number(contacts.active_24h || 0),
      },
      templates: {
        approved: templatesByStatus['APPROVED'] || 0,
        inReview: templatesByStatus['IN_REVIEW'] || 0,
        rejected: templatesByStatus['REJECTED'] || 0,
      },
      broadcasts: {
        active: Number(broadcasts.active || 0),
      },
    };
  }

  async findAll(page = 1, limit = 20) {
    const [shops, total] = await this.shopRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: { gupshupApps: true },
    });

    return {
      data: shops.map((s) => ({
        ...s,
        walletBalancePaise: Number(s.walletBalancePaise),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Daily message + spend buckets for the shop dashboard, scoped to the
   * requested time range (7 or 30 days). Dates come back as YYYY-MM-DD.
   */
  async getShopAnalytics(shopId: string, days = 7) {
    const range = [7, 30].includes(days) ? days : 7;
    const rows = await this.shopRepo.query(
      `SELECT
         to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
         COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outbound,
         COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound,
         COALESCE(SUM(cost_paise) FILTER (WHERE direction = 'outbound'), 0)::bigint AS spend_paise
       FROM messages
       WHERE shop_id = $1
         AND created_at > now() - ($2 || ' days')::interval
       GROUP BY 1
       ORDER BY 1 ASC`,
      [shopId, String(range)],
    );

    return {
      days: range,
      series: rows.map((r) => ({
        day: r.day,
        outbound: Number(r.outbound || 0),
        inbound: Number(r.inbound || 0),
        spendPaise: Number(r.spend_paise || 0),
      })),
    };
  }

  async update(
    id: string,
    dto: { businessName?: string; category?: string },
  ) {
    await this.shopRepo.update(id, dto);
    return this.findById(id);
  }

  async updateStatus(id: string, status: 'onboarding' | 'active' | 'suspended') {
    await this.shopRepo.update(id, { status });
    return this.findById(id);
  }

  /**
   * Real platform-wide aggregates for the super-admin overview.
   * Every number here comes from SQL — nothing hardcoded.
   */
  async getPlatformStats() {
    const [shopRows, messageRows, walletRows, broadcastRows] = await Promise.all([
      this.shopRepo.query(`
        SELECT
          COUNT(*)::int AS total_shops,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active_shops,
          COUNT(*) FILTER (WHERE status = 'onboarding')::int AS onboarding_shops,
          COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended_shops,
          COALESCE(SUM(wallet_balance_paise), 0)::bigint AS total_wallet_balance_paise
        FROM shops
      `),
      this.shopRepo.query(`
        SELECT
          COUNT(*)::int AS total_messages,
          COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outbound_messages,
          COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound_messages,
          COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS messages_last_24h,
          COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at > now() - interval '24 hours')::int AS outbound_last_24h
        FROM messages
      `),
      this.shopRepo.query(`
        SELECT
          COALESCE(SUM(amount_paise) FILTER (WHERE type = 'topup'), 0)::bigint AS total_topups_paise,
          COALESCE(SUM(-amount_paise) FILTER (WHERE type = 'debit'), 0)::bigint AS total_debits_paise,
          COALESCE(SUM(amount_paise) FILTER (WHERE type = 'refund'), 0)::bigint AS total_refunds_paise
        FROM wallet_transactions
      `),
      this.shopRepo.query(`
        SELECT
          COUNT(*)::int AS total_broadcasts,
          COUNT(*) FILTER (WHERE status IN ('queued', 'sending'))::int AS active_broadcasts,
          COALESCE(SUM(sent_count), 0)::int AS broadcast_messages_sent
        FROM broadcasts
      `),
    ]);

    const shops = shopRows[0] || {};
    const messages = messageRows[0] || {};
    const wallet = walletRows[0] || {};
    const broadcasts = broadcastRows[0] || {};

    return {
      shops: {
        total: Number(shops.total_shops || 0),
        active: Number(shops.active_shops || 0),
        onboarding: Number(shops.onboarding_shops || 0),
        suspended: Number(shops.suspended_shops || 0),
        totalWalletBalancePaise: Number(shops.total_wallet_balance_paise || 0),
      },
      messages: {
        total: Number(messages.total_messages || 0),
        outbound: Number(messages.outbound_messages || 0),
        inbound: Number(messages.inbound_messages || 0),
        last24h: Number(messages.messages_last_24h || 0),
        outboundLast24h: Number(messages.outbound_last_24h || 0),
      },
      wallet: {
        totalTopupsPaise: Number(wallet.total_topups_paise || 0),
        totalDebitsPaise: Number(wallet.total_debits_paise || 0),
        totalRefundsPaise: Number(wallet.total_refunds_paise || 0),
      },
      broadcasts: {
        total: Number(broadcasts.total_broadcasts || 0),
        active: Number(broadcasts.active_broadcasts || 0),
        messagesSent: Number(broadcasts.broadcast_messages_sent || 0),
      },
    };
  }
}
