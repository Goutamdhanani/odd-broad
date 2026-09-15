import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';

@Entity('gupshup_apps')
export class GupshupApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId: string;

  @ManyToOne(() => Shop, (shop) => shop.gupshupApps)
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'text', name: 'gupshup_app_id', unique: true })
  gupshupAppId: string;

  @Column({ type: 'text', name: 'app_token', nullable: true })
  appToken: string | null;

  @Column({ type: 'text', name: 'phone_number', nullable: true })
  phoneNumber: string | null;

  @Column({ type: 'text', name: 'onboarding_type' })
  onboardingType: 'new_number' | 'existing_number';

  @Column({ type: 'text', name: 'waba_status', default: 'pending' })
  wabaStatus: 'pending' | 'live' | 'rejected';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
