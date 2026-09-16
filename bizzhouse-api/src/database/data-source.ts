import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../modules/auth/entities/user.entity';
import { Shop } from '../modules/shops/entities/shop.entity';
import { GupshupApp } from '../modules/gupshup/entities/gupshup-app.entity';
import { WalletTransaction } from '../modules/wallet/entities/wallet-transaction.entity';
import { Contact } from '../modules/contacts/entities/contact.entity';
import { Message } from '../modules/messages/entities/message.entity';
import { WebhookEvent } from '../modules/webhooks/entities/webhook-event.entity';
import { Template } from '../modules/templates/entities/template.entity';
import { RateCard } from '../modules/pricing/entities/rate-card.entity';
import { Broadcast } from '../modules/broadcasts/entities/broadcast.entity';
import { AutomationRule } from '../modules/automation/entities/automation-rule.entity';
import { InitialSchema1788746773473 } from './migrations/1788746773473-InitialSchema';
import { AuthTenancyCore1788746773474 } from './migrations/1788746773474-AuthTenancyCore';
import { CreateTemplatesTable1788746773475 } from './migrations/1788746773475-CreateTemplatesTable';
import { CreateRateCardsTable1788746773476 } from './migrations/1788746773476-CreateRateCardsTable';
import { BroadcastsAndOptInTracking1789000000000 } from './migrations/1789000000000-BroadcastsAndOptInTracking';
import { AutomationRules1789100000000 } from './migrations/1789100000000-AutomationRules';
import { TeamAndAssignment1789200000000 } from './migrations/1789200000000-TeamAndAssignment';
import { CarouselTemplatesAndNumberHealth1789300000000 } from './migrations/1789300000000-CarouselTemplatesAndNumberHealth';
import { BroadcastMessageAttribution1789400000000 } from './migrations/1789400000000-BroadcastMessageAttribution';
import { CacheEmbedSignupLink1789500000000 } from './migrations/1789500000000-CacheEmbedSignupLink';
import { UniqueMessageIdIndex1789600000000 } from './migrations/1789600000000-UniqueMessageIdIndex';

/**
 * Standalone TypeORM DataSource for the CLI (migrations + schema sync checks).
 * App runtime uses app.module.ts; keep the two entity lists in sync.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USER || 'bizzhouse',
  password: process.env.DATABASE_PASSWORD || 'bizzhouse_dev_2026',
  database: process.env.DATABASE_NAME || 'bizzhouse',
  synchronize: false,
  logging: false,
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
    BroadcastMessageAttribution1789400000000,
    CacheEmbedSignupLink1789500000000,
    UniqueMessageIdIndex1789600000000,
  ],
  migrationsTableName: 'migrations',
});
