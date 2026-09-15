import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastsProcessor } from './broadcasts.processor';
import { BroadcastsController } from './broadcasts.controller';
import { Broadcast } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { Template } from '../templates/entities/template.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { RateCard } from '../pricing/entities/rate-card.entity';
import { MessagesModule } from '../messages/messages.module';
import { WalletModule } from '../wallet/wallet.module';
import { GupshupModule } from '../gupshup/gupshup.module';
import { PricingService } from '../../shared/pricing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Broadcast, Contact, Template, GupshupApp, RateCard]),
    BullModule.registerQueue({ name: 'broadcast-dispatch' }),
    MessagesModule,
    WalletModule,
    GupshupModule,
  ],
  providers: [BroadcastsService, BroadcastsProcessor, PricingService],
  controllers: [BroadcastsController],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
