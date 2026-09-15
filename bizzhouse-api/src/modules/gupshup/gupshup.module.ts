import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { GupshupService } from './gupshup.service';
import { GupshupController } from './gupshup.controller';
import { NumberHealthService } from './number-health.service';
import { GupshupApp } from './entities/gupshup-app.entity';
import { Shop } from '../shops/entities/shop.entity';
import { Message } from '../messages/entities/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GupshupApp, Shop, Message]), ConfigModule],
  controllers: [GupshupController],
  providers: [GupshupService, NumberHealthService],
  exports: [GupshupService, NumberHealthService],
})
export class GupshupModule {}
