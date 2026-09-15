import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../modules/auth/entities/user.entity';
import { Shop } from '../modules/shops/entities/shop.entity';
import { GupshupApp } from '../modules/gupshup/entities/gupshup-app.entity';
import { Contact } from '../modules/contacts/entities/contact.entity';
import { WalletTransaction } from '../modules/wallet/entities/wallet-transaction.entity';
import { Message } from '../modules/messages/entities/message.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Shop,
      GupshupApp,
      Contact,
      WalletTransaction,
      Message,
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class DatabaseModule {}
