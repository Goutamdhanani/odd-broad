import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThanOrEqual } from 'typeorm';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { Shop } from '../shops/entities/shop.entity';
import { escapeCsvValue } from '../../shared/csv';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepo: Repository<WalletTransaction>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    private readonly dataSource: DataSource,
  ) {}

  private getFirstRow(res: any) {
    if (!res || res.length === 0) return null;
    const rows = Array.isArray(res[0]) ? res[0] : res;
    return rows && rows.length > 0 ? rows[0] : null;
  }

  private getRows(res: any) {
    if (!res || res.length === 0) return [];
    return Array.isArray(res[0]) ? res[0] : res;
  }

  /**
   * Phase 18: get current shop wallet balance.
   */
  async getBalance(shopId: string): Promise<number> {
    const result = await this.dataSource.query(
      `SELECT wallet_balance_paise FROM shops WHERE id = $1`,
      [shopId],
    );
    const row = this.getFirstRow(result);
    if (!row) throw new BadRequestException('Shop not found');
    return Number(row.wallet_balance_paise);
  }

  /**
   * Phase 19: get transaction ledger for shop with pagination.
   */
  async getTransactions(shopId: string, page = 1, limit = 20) {
    const [data, total] = await this.walletTransactionRepo.findAndCount({
      where: { shopId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * CSV export of the shop's ledger for accounting/reconciliation.
   * Amounts as ₹ with explicit sign (debits negative, per the ledger's
   * sign convention), newest first, capped window default 90 days.
   */
  async exportCsv(shopId: string, days = 90): Promise<string> {
    const windowDays = Math.min(Math.max(days, 1), 365);
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const rows = await this.walletTransactionRepo.find({
      where: { shopId, createdAt: MoreThanOrEqual(cutoff) },
      order: { createdAt: 'DESC' },
    });

    const rupees = (paise: number | string) => (Number(paise) / 100).toFixed(2);
    const header = ['date', 'type', 'amount_rupees', 'balance_after_rupees', 'reference_id', 'description'];
    const lines = rows.map((r) => [
      new Date(r.createdAt).toISOString(),
      r.type,
      rupees(r.amountPaise),
      rupees(r.balanceAfterPaise),
      escapeCsvValue(r.referenceId ?? ''),
      escapeCsvValue(r.description ?? ''),
    ]);
    return [header.join(','), ...lines.map((l) => l.join(','))].join('\r\n');
  }

  /**
   * Admin: credit a shop's wallet (manual top-up for Phase 1).
   */
  async creditShop(
    shopId: string,
    amountPaise: number,
    description?: string,
  ) {
    if (amountPaise <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      const result = await manager.query(
        `UPDATE shops
         SET wallet_balance_paise = wallet_balance_paise + $1
         WHERE id = $2
         RETURNING wallet_balance_paise`,
        [amountPaise, shopId],
      );

      const row = this.getFirstRow(result);
      if (!row) {
        throw new BadRequestException('Shop not found');
      }

      const newBalance = Number(row.wallet_balance_paise);

      await manager.save(WalletTransaction, {
        shopId,
        type: 'topup' as const,
        amountPaise,
        referenceId: `admin-credit-${Date.now()}`,
        balanceAfterPaise: newBalance,
        description: description || 'Admin manual credit',
      });

      this.logger.log(
        `Credited shop ${shopId}: +${amountPaise} paise → balance ${newBalance}`,
      );

      return { shopId, newBalancePaise: newBalance };
    });
  }

  /**
   * Admin: manual debit of a shop's wallet balance.
   */
  async debitShop(
    shopId: string,
    amountPaise: number,
    description?: string,
  ) {
    if (amountPaise <= 0) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      const result = await manager.query(
        `UPDATE shops
         SET wallet_balance_paise = wallet_balance_paise - $1
         WHERE id = $2 AND wallet_balance_paise >= $1
         RETURNING wallet_balance_paise`,
        [amountPaise, shopId],
      );

      const row = this.getFirstRow(result);
      if (!row) {
        throw new BadRequestException('Shop not found or insufficient balance');
      }

      const newBalance = Number(row.wallet_balance_paise);

      await manager.save(WalletTransaction, {
        shopId,
        type: 'debit' as const,
        // Sign convention (doc §7): debits are negative, topups/refunds positive.
        // debitForMessage already follows this; keep admin debits consistent
        // or ledger reconciliation sums will drift from the cached balance.
        amountPaise: -amountPaise,
        referenceId: `admin-debit-${Date.now()}`,
        balanceAfterPaise: newBalance,
        description: description || 'Admin manual debit adjustment',
      });

      this.logger.log(
        `Debited shop ${shopId}: -${amountPaise} paise → balance ${newBalance}`,
      );

      return { shopId, newBalancePaise: newBalance };
    });
  }

  /**
   * Idempotent recharge credit keyed by the razorpay payment id.
   */
  async creditRecharge(
    shopId: string,
    amountPaise: number,
    paymentId: string,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const existingRes = await manager.query(
        `SELECT id FROM wallet_transactions
         WHERE shop_id = $1 AND reference_id = $2 AND type = 'topup'`,
        [shopId, paymentId],
      );
      const existing = this.getRows(existingRes);

      if (existing.length > 0) {
        this.logger.warn(
          `Idempotency guard: recharge ${paymentId} already credited, skipping duplicate`,
        );
        const currentRes = await manager.query(
          `SELECT wallet_balance_paise FROM shops WHERE id = $1`,
          [shopId],
        );
        const row = this.getFirstRow(currentRes);
        return Number(row?.wallet_balance_paise ?? 0);
      }

      const result = await manager.query(
        `UPDATE shops
         SET wallet_balance_paise = wallet_balance_paise + $1
         WHERE id = $2
         RETURNING wallet_balance_paise`,
        [amountPaise, shopId],
      );

      const row = this.getFirstRow(result);
      if (!row) {
        throw new BadRequestException('Shop not found');
      }

      const newBalance = Number(row.wallet_balance_paise);

      await manager.save(WalletTransaction, {
        shopId,
        type: 'topup' as const,
        amountPaise,
        referenceId: paymentId,
        balanceAfterPaise: newBalance,
        description: `Razorpay recharge: ${paymentId}`,
      });

      this.logger.log(
        `Recharge credited shop ${shopId}: +${amountPaise} paise via ${paymentId} → balance ${newBalance}`,
      );

      return newBalance;
    });
  }

  /**
   * Atomic debit for message sending. Idempotent per messageId: the send
   * pipeline can retry a provider call after a timeout, and the shop must
   * never be debited twice for one message (mirrors the refund guard).
   */
  async debitForMessage(
    shopId: string,
    costPaise: number,
    messageId: string,
  ): Promise<{ success: boolean; newBalance: number }> {
    if (costPaise <= 0) {
      const currentBalance = await this.getBalance(shopId);
      return { success: true, newBalance: currentBalance };
    }

    return this.dataSource.transaction(async (manager) => {
      // Idempotency guard: an existing debit row for this message means a
      // retry already charged the wallet — report success with the current
      // balance instead of debiting again.
      const existingRes = await manager.query(
        `SELECT id FROM wallet_transactions
         WHERE shop_id = $1 AND reference_id = $2 AND type = 'debit'`,
        [shopId, messageId],
      );
      if (this.getRows(existingRes).length > 0) {
        this.logger.warn(
          `Idempotency guard: debit already exists for message ${messageId}, skipping duplicate debit`,
        );
        const balRes = await manager.query(
          `SELECT wallet_balance_paise FROM shops WHERE id = $1`,
          [shopId],
        );
        return {
          success: true,
          newBalance: Number(this.getFirstRow(balRes)?.wallet_balance_paise ?? 0),
        };
      }

      const result = await manager.query(
        `UPDATE shops
         SET wallet_balance_paise = wallet_balance_paise - $1
         WHERE id = $2
           AND wallet_balance_paise >= $1
         RETURNING wallet_balance_paise`,
        [costPaise, shopId],
      );

      const row = this.getFirstRow(result);
      if (!row) {
        return { success: false, newBalance: -1 };
      }

      const newBalance = Number(row.wallet_balance_paise);

      await manager.save(WalletTransaction, {
        shopId,
        type: 'debit' as const,
        amountPaise: -costPaise,
        referenceId: messageId,
        balanceAfterPaise: newBalance,
        description: `Message send: ${messageId}`,
      });

      return { success: true, newBalance };
    });
  }

  /**
   * Refund on message failure.
   */
  async refundForMessage(
    shopId: string,
    costPaise: number,
    messageId: string,
  ): Promise<number> {
    if (costPaise <= 0) {
      return this.getBalance(shopId);
    }

    return this.dataSource.transaction(async (manager) => {
      const shopRowRes = await manager.query(
        `SELECT wallet_balance_paise FROM shops WHERE id = $1 FOR UPDATE`,
        [shopId],
      );
      const shopRow = this.getFirstRow(shopRowRes);

      if (!shopRow) {
        throw new BadRequestException('Shop not found');
      }

      const existingRefundRes = await manager.query(
        `SELECT id FROM wallet_transactions 
         WHERE shop_id = $1 AND reference_id = $2 AND type = 'refund'`,
        [shopId, messageId],
      );
      const existingRefund = this.getRows(existingRefundRes);

      if (existingRefund.length > 0) {
        this.logger.warn(
          `Idempotency guard: refund already exists for message ${messageId}, skipping duplicate refund`,
        );
        return Number(shopRow.wallet_balance_paise);
      }

      const result = await manager.query(
        `UPDATE shops
         SET wallet_balance_paise = wallet_balance_paise + $1
         WHERE id = $2
         RETURNING wallet_balance_paise`,
        [costPaise, shopId],
      );

      const row = this.getFirstRow(result);
      const newBalance = Number(row?.wallet_balance_paise ?? 0);

      await manager.save(WalletTransaction, {
        shopId,
        type: 'refund' as const,
        amountPaise: costPaise,
        referenceId: messageId,
        balanceAfterPaise: newBalance,
        description: `Refund for failed message: ${messageId}`,
      });

      this.logger.log(
        `Refunded shop ${shopId}: +${costPaise} paise for message ${messageId} → new balance ${newBalance}`,
      );

      return newBalance;
    });
  }
}
