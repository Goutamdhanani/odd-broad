import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text', name: 'gupshup_app_id', nullable: true })
  gupshupAppId: string;

  @Column({ type: 'text', name: 'event_type', nullable: true })
  eventType: string;

  @Column({ type: 'jsonb', name: 'raw_payload' })
  rawPayload: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  processed: boolean;

  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;
}
