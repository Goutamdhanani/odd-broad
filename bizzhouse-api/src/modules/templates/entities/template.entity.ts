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
import { GupshupCarouselCard } from '../../gupshup/gupshup.types';

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

/** Template types Gupshup accepts on POST /partner/app/{appId}/templates */
export enum TemplateType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  CAROUSEL = 'CAROUSEL',
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

  /** TEXT | IMAGE | VIDEO | DOCUMENT | CAROUSEL — mirrors Gupshup templateType */
  @Column({
    type: 'text',
    name: 'template_type',
    default: TemplateType.TEXT,
  })
  templateType: TemplateType;

  /**
   * Carousel cards exactly as Gupshup defines them (headerType, mediaId,
   * body, sampleText, buttons) — 2-10 entries. Null for non-carousel.
   */
  @Column({ type: 'jsonb', nullable: true, default: null })
  cards: GupshupCarouselCard[] | null;

  @Column({ type: 'text', nullable: true })
  vertical: string | null;

  @Column({ type: 'text', name: 'header_text', nullable: true })
  headerText: string | null;

  @Column({ type: 'text', name: 'footer_text', nullable: true })
  footerText: string | null;

  @Column({ type: 'text', nullable: true })
  example: string | null;

  @Column({ type: 'jsonb', nullable: true, default: '[]' })
  buttons: string[] | null;

  @Column({ type: 'text', name: 'gupshup_template_id', nullable: true })
  gupshupTemplateId: string | null;

  /**
   * Templates live per Gupshup app (per WABA). A shop with multiple
   * numbers gets the same template submitted to each live app; this maps
   * appId → provider templateId so edits hit every copy.
   */
  @Column({ type: 'jsonb', name: 'gupshup_template_ids', nullable: true, default: '{}' })
  gupshupTemplateIds: Record<string, string> | null;

  @Column({ type: 'text', name: 'rejection_reason', nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
