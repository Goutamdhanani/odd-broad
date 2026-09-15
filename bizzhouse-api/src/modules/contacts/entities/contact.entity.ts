import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  OneToMany,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';
import { Message } from '../../messages/entities/message.entity';

@Entity('contacts')
@Unique(['shopId', 'waId'])
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId: string;

  @ManyToOne(() => Shop, (shop) => shop.contacts)
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'text', name: 'wa_id' })
  waId: string;

  @Column({ type: 'text', nullable: true })
  name: string;

  @Column({ type: 'boolean', name: 'opted_in', default: false })
  optedIn: boolean;

  @Column({ type: 'timestamptz', name: 'opted_in_at', nullable: true })
  optedInAt: Date | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ name: 'last_inbound_at', type: 'timestamptz', nullable: true })
  lastInboundAt: Date | null;

  @Column({ type: 'uuid', name: 'assigned_user_id', nullable: true })
  assignedUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Message, (message) => message.contact)
  messages: Message[];
}
