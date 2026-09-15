import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { GupshupApp } from '../../gupshup/entities/gupshup-app.entity';
import { WalletTransaction } from '../../wallet/entities/wallet-transaction.entity';
import { Contact } from '../../contacts/entities/contact.entity';
import { Message } from '../../messages/entities/message.entity';
import { Template } from '../../templates/entities/template.entity';

@Entity('shops')
export class Shop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'business_name' })
  businessName: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'uuid', name: 'owner_user_id', nullable: true })
  ownerUserId: string | null;

  @OneToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'owner_user_id' })
  owner: User | null;

  @Column({ type: 'text', nullable: true })
  category: string;

  @Column({ type: 'text', default: 'onboarding' })
  status: 'onboarding' | 'active' | 'suspended';

  @Column({ type: 'bigint', name: 'wallet_balance_paise', default: 0 })
  walletBalancePaise: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => GupshupApp, (app) => app.shop)
  gupshupApps: GupshupApp[];

  @OneToMany(() => WalletTransaction, (tx) => tx.shop)
  walletTransactions: WalletTransaction[];

  @OneToMany(() => Contact, (contact) => contact.shop)
  contacts: Contact[];

  @OneToMany(() => Message, (message) => message.shop)
  messages: Message[];

  @OneToMany(() => Template, (template) => template.shop)
  templates: Template[];
}
