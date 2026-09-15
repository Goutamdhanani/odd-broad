import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { GupshupModule } from '../gupshup/gupshup.module';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GupshupApp]), GupshupModule],
  providers: [MediaService],
  controllers: [MediaController],
  exports: [MediaService],
})
export class MediaModule {}
