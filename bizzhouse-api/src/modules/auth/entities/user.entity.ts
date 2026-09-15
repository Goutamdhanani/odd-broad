import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text', name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: 'shop_owner' })
  role: 'super_admin' | 'shop_owner' | 'shop_staff';

  @Column({ type: 'uuid', name: 'shop_id', nullable: true })
  shopId: string | null;

  @ManyToOne(() => Shop, { nullable: true })
  @JoinColumn({ name: 'shop_id' })
  shop: Shop | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
