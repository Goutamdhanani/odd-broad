import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhooksProcessor } from './webhooks.processor';
import { WebhookEvent } from './entities/webhook-event.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { Shop } from '../shops/entities/shop.entity';
import { MessagesModule } from '../messages/messages.module';
import { TemplatesModule } from '../templates/templates.module';
import { GupshupModule } from '../gupshup/gupshup.module';
import { AutomationModule } from '../automation/automation.module';
import { MediaModule } from '../media/media.module';
import { Message } from '../messages/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent, Contact, GupshupApp, Shop, Message]),
    BullModule.registerQueue({ name: 'webhook-events' }),
    MessagesModule,
    TemplatesModule,
    GupshupModule,
    AutomationModule,
    MediaModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksProcessor],
})
export class WebhooksModule {}
