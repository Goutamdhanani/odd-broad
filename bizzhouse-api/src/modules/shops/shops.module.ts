import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopsService } from './shops.service';
import { ShopsController } from './shops.controller';
import { Shop } from './entities/shop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shop])],
  providers: [ShopsService],
  controllers: [ShopsController],
  exports: [ShopsService],
})
export class ShopsModule {}
