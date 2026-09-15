import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { ShopsModule } from './modules/shops/shops.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { GupshupModule } from './modules/gupshup/gupshup.module';
import { MessagesModule } from './modules/messages/messages.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { BroadcastsModule } from './modules/broadcasts/broadcasts.module';
import { AutomationModule } from './modules/automation/automation.module';
import { MediaModule } from './modules/media/media.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { TeamModule } from './modules/team/team.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';

// Entities
import { User } from './modules/auth/entities/user.entity';
import { Shop } from './modules/shops/entities/shop.entity';
import { GupshupApp } from './modules/gupshup/entities/gupshup-app.entity';
import { WalletTransaction } from './modules/wallet/entities/wallet-transaction.entity';
import { Contact } from './modules/contacts/entities/contact.entity';
import { Message } from './modules/messages/entities/message.entity';
import { WebhookEvent } from './modules/webhooks/entities/webhook-event.entity';
import { Template } from './modules/templates/entities/template.entity';
import { RateCard } from './modules/pricing/entities/rate-card.entity';
import { Broadcast } from './modules/broadcasts/entities/broadcast.entity';
import { AutomationRule } from './modules/automation/entities/automation-rule.entity';
import { InitialSchema1788746773473 } from './database/migrations/1788746773473-InitialSchema';
import { AuthTenancyCore1788746773474 } from './database/migrations/1788746773474-AuthTenancyCore';
import { CreateTemplatesTable1788746773475 } from './database/migrations/1788746773475-CreateTemplatesTable';
import { CreateRateCardsTable1788746773476 } from './database/migrations/1788746773476-CreateRateCardsTable';
import { BroadcastsAndOptInTracking1789000000000 } from './database/migrations/1789000000000-BroadcastsAndOptInTracking';
import { AutomationRules1789100000000 } from './database/migrations/1789100000000-AutomationRules';
import { TeamAndAssignment1789200000000 } from './database/migrations/1789200000000-TeamAndAssignment';
import { CarouselTemplatesAndNumberHealth1789300000000 } from './database/migrations/1789300000000-CarouselTemplatesAndNumberHealth';

@Module({
  imports: [
    // ─── Config ──────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // ─── Database ────────────────────────────────────
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: [
          User,
          Shop,
          GupshupApp,
          WalletTransaction,
          Contact,
          Message,
          WebhookEvent,
          Template,
          RateCard,
          Broadcast,
          AutomationRule,
        ],
        migrations: [
          InitialSchema1788746773473,
          AuthTenancyCore1788746773474,
          CreateTemplatesTable1788746773475,
          CreateRateCardsTable1788746773476,
          BroadcastsAndOptInTracking1789000000000,
          AutomationRules1789100000000,
          TeamAndAssignment1789200000000,
          CarouselTemplatesAndNumberHealth1789300000000,
        ],
        migrationsRun: true,
        synchronize: false,
        logging: config.get<string>('nodeEnv') === 'development',
      }),
    }),

    // ─── BullMQ (Redis queues) ───────────────────────
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),

    // ─── Feature modules ─────────────────────────────
    AuthModule,
    ShopsModule,
    WalletModule,
    GupshupModule,
    MessagesModule,
    WebhooksModule,
    ContactsModule,
    PaymentsModule,
    TemplatesModule,
    TasksModule,
    BroadcastsModule,
    AutomationModule,
    MediaModule,
    PricingModule,
    TeamModule,
    DatabaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
