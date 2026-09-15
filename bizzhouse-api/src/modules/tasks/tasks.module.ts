import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shop } from '../shops/entities/shop.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { WebhookEvent } from '../webhooks/entities/webhook-event.entity';
import { GupshupModule } from '../gupshup/gupshup.module';
import { TemplatesModule } from '../templates/templates.module';
import { CronTasksService } from './cron-tasks.service';
import { AlertService } from '../../shared/alert.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Shop, GupshupApp, WebhookEvent]),
    GupshupModule,
    TemplatesModule,
  ],
  providers: [CronTasksService, AlertService],
  exports: [CronTasksService],
})
export class TasksModule {}
