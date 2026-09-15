import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Template } from './entities/template.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { GupshupModule } from '../gupshup/gupshup.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, GupshupApp]),
    GupshupModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
