import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('rate_cards')
@Unique(['category', 'countryCode'])
export class RateCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  category: string;

  @Column({ type: 'text', name: 'country_code', default: 'IN' })
  countryCode: string;

  @Column({ type: 'integer', name: 'cost_paise' })
  costPaise: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
