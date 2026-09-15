import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';

/**
 * Append-only ledger — never UPDATE a row, only INSERT.
 * This is the source of truth for all wallet mutations.
 */
@Entity('wallet_transactions')
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId: string;

  @ManyToOne(() => Shop, (shop) => shop.walletTransactions)
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'text' })
  type: 'topup' | 'debit' | 'refund';

  @Column({ type: 'bigint', name: 'amount_paise' })
  amountPaise: number;

  @Column({ type: 'text', name: 'reference_id', nullable: true })
  referenceId: string;

  @Column({ type: 'bigint', name: 'balance_after_paise' })
  balanceAfterPaise: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
