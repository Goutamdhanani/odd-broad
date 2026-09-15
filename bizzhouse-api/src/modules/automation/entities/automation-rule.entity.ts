import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';

export enum AutomationMatchType {
  CONTAINS = 'contains',
  EXACT = 'exact',
  STARTS_WITH = 'starts_with',
}

@Entity('automation_rules')
@Index(['shopId'])
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  keyword: string;

  @Column({ type: 'text', name: 'match_type', default: AutomationMatchType.CONTAINS })
  matchType: AutomationMatchType;

  @Column({ type: 'text', name: 'reply_text' })
  replyText: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'integer', name: 'triggered_count', default: 0 })
  triggeredCount: number;

  @Column({ type: 'timestamptz', name: 'last_triggered_at', nullable: true })
  lastTriggeredAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
