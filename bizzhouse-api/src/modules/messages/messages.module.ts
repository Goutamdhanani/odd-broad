import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagesGateway } from './messages.gateway';
import { Message } from './entities/message.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { Template } from '../templates/entities/template.entity';
import { User } from '../auth/entities/user.entity';
import { RateCard } from '../pricing/entities/rate-card.entity';
import { GupshupModule } from '../gupshup/gupshup.module';
import { WalletModule } from '../wallet/wallet.module';
import { PricingService } from '../../shared/pricing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Contact, GupshupApp, Template, RateCard, User]),
    GupshupModule,
    WalletModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [MessagesService, MessagesGateway, PricingService],
  controllers: [MessagesController],
  exports: [MessagesService, MessagesGateway],
})
export class MessagesModule {}
