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

export enum BroadcastStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('broadcasts')
@Index(['shopId'])
export class Broadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', name: 'template_name' })
  templateName: string;

  @Column({ type: 'text', name: 'template_language', default: 'en' })
  templateLanguage: string;

  @Column({ type: 'jsonb', name: 'template_components', nullable: true, default: '[]' })
  templateComponents: any[] | null;

  @Column({ type: 'text', name: 'audience_tag', nullable: true })
  audienceTag: string | null;

  @Column({ type: 'text', default: BroadcastStatus.QUEUED })
  status: BroadcastStatus;

  @Column({ type: 'integer', name: 'total_recipients', default: 0 })
  totalRecipients: number;

  @Column({ type: 'integer', name: 'sent_count', default: 0 })
  sentCount: number;

  @Column({ type: 'integer', name: 'failed_count', default: 0 })
  failedCount: number;

  @Column({ type: 'integer', name: 'skipped_count', default: 0 })
  skippedCount: number;

  @Column({ type: 'bigint', name: 'cost_paise', default: 0 })
  costPaise: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt: Date | null;
}
