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

export enum TemplateCategory {
  MARKETING = 'MARKETING',
  UTILITY = 'UTILITY',
  AUTHENTICATION = 'AUTHENTICATION',
}

export enum TemplateStatus {
  SUBMITTED = 'SUBMITTED',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

@Entity('templates')
@Index(['shopId', 'elementName'], { unique: true })
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId: string;

  @ManyToOne(() => Shop, (shop) => shop.templates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'text', name: 'element_name' })
  elementName: string;

  @Column({
    type: 'enum',
    enum: TemplateCategory,
    default: TemplateCategory.MARKETING,
  })
  category: TemplateCategory;

  @Column({ type: 'text', default: 'en_US' })
  language: string;

  @Column({
    type: 'enum',
    enum: TemplateStatus,
    default: TemplateStatus.IN_REVIEW,
  })
  status: TemplateStatus;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  buttons: string[] | null;

  @Column({ type: 'text', name: 'gupshup_template_id', nullable: true })
  gupshupTemplateId: string | null;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
