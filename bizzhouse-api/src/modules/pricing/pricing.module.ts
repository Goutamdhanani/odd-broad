import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingController } from './pricing.controller';
import { PricingService } from '../../shared/pricing.service';
import { RateCard } from './entities/rate-card.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RateCard])],
  providers: [PricingService],
  controllers: [PricingController],
  exports: [PricingService],
})
export class PricingModule {}
