import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Shop } from '../../shops/entities/shop.entity';
import { Contact } from '../../contacts/entities/contact.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'shop_id' })
  shopId: string;

  @ManyToOne(() => Shop, (shop) => shop.messages)
  @JoinColumn({ name: 'shop_id' })
  shop: Shop;

  @Column({ type: 'uuid', name: 'contact_id' })
  contactId: string;

  @ManyToOne(() => Contact, (contact) => contact.messages)
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @Column({ type: 'text' })
  direction: 'outbound' | 'inbound';

  @Column({ type: 'text', name: 'message_type' })
  messageType: 'text' | 'template' | 'image' | 'video' | 'document' | 'audio' | 'sticker' | 'location' | 'contacts';

  @Column({ type: 'text', name: 'gupshup_message_id', nullable: true })
  gupshupMessageId: string;

  /** gupshup_app_id of the number that sent this — powers per-number
   *  health stats (24h volume vs tier ceiling, failure rate). */
  @Column({ type: 'text', name: 'gupshup_app_id', nullable: true })
  gupshupAppId: string | null;

  /** Owning campaign (spec §2.1): lets delivered/read webhook receipts roll
   *  up into the broadcast's live summary. Null for 1:1 inbox messages. */
  @Column({ type: 'uuid', name: 'broadcast_id', nullable: true })
  broadcastId: string | null;

  @Column({ type: 'text', default: 'queued' })
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

  @Column({ type: 'bigint', name: 'cost_paise', nullable: true })
  costPaise: number;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
