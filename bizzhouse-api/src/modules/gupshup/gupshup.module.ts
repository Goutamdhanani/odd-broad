import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { GupshupService } from './gupshup.service';
import { GupshupController } from './gupshup.controller';
import { GupshupApp } from './entities/gupshup-app.entity';
import { Shop } from '../shops/entities/shop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GupshupApp, Shop]), ConfigModule],
  controllers: [GupshupController],
  providers: [GupshupService],
  exports: [GupshupService],
})
export class GupshupModule {}
