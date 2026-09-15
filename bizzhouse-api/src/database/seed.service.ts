import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../modules/auth/entities/user.entity';
import { Shop } from '../modules/shops/entities/shop.entity';
import { GupshupApp } from '../modules/gupshup/entities/gupshup-app.entity';
import { Contact } from '../modules/contacts/entities/contact.entity';
import { WalletTransaction } from '../modules/wallet/entities/wallet-transaction.entity';
import { Message } from '../modules/messages/entities/message.entity';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Shop)
    private readonly shopRepo: Repository<Shop>,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(WalletTransaction)
    private readonly txRepo: Repository<WalletTransaction>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    const isProduction = this.config.get<string>('nodeEnv') === 'production';

    await this.seedSuperAdmin();

    // The demo shop (known password, pre-funded wallet, live mock WABA)
    // is a development convenience - never seed known credentials into
    // production databases.
    if (isProduction) {
      this.logger.log('Production environment: skipping demo shop seed');
      return;
    }
    await this.seedDemoShop();
  }

  async seedSuperAdmin(): Promise<void> {
    const adminEmail = this.config.get<string>('admin.email') || 'admin@bizzhouse.com';
    const adminPassword = this.config.get<string>('admin.password') || 'Admin@BizzHouse2026';
    const adminName = this.config.get<string>('admin.name') || 'Platform Admin';

    try {
      const existingAdmin = await this.userRepo.findOne({
        where: [{ email: adminEmail }, { role: 'super_admin' }],
      });

      if (existingAdmin) {
        this.logger.log(`Super admin account ready: ${existingAdmin.email}`);
        return;
      }

      const passwordHash = await bcrypt.hash(adminPassword, 12);
      const adminUser = this.userRepo.create({
        email: adminEmail,
        passwordHash,
        name: adminName,
        role: 'super_admin',
        shopId: null,
      });

      await this.userRepo.save(adminUser);
      this.logger.log(`✅ Default super admin created: ${adminEmail} (password: ${adminPassword})`);
    } catch (err: any) {
      if (err?.code === '23505') {
        this.logger.log('Super admin already created by another process');
      } else {
        this.logger.error(`Failed to seed super admin: ${err?.message}`, err?.stack);
      }
    }
  }

  async seedDemoShop(): Promise<void> {
    const demoEmail = 'demo@bizzhouse.com';
    const demoPassword = 'Demo@BizzHouse2026';

    try {
      const existingDemo = await this.userRepo.findOne({
        where: { email: demoEmail },
      });

      if (existingDemo) {
        this.logger.log(`Demo store account ready: ${demoEmail}`);
        return;
      }

      // 1. Create shop with ₹500 starting credit
      const shop = this.shopRepo.create({
        businessName: 'Demo Fashion Boutique',
        category: 'retail',
        status: 'active',
        walletBalancePaise: 50000, // ₹500.00
      });
      const savedShop = await this.shopRepo.save(shop);

      // 2. Create demo shop owner user
      const passwordHash = await bcrypt.hash(demoPassword, 12);
      const demoUser = this.userRepo.create({
        email: demoEmail,
        passwordHash,
        name: 'Demo Store Manager',
        role: 'shop_owner',
        shopId: savedShop.id,
      });
      await this.userRepo.save(demoUser);

      // 3. Create active Gupshup app
      const gupshupApp = this.gupshupAppRepo.create({
        shopId: savedShop.id,
        gupshupAppId: 'mock-app-demo',
        phoneNumber: '919876543210',
        onboardingType: 'new_number',
        wabaStatus: 'live',
      });
      await this.gupshupAppRepo.save(gupshupApp);

      // 4. Create initial top-up transaction
      const topupTx = this.txRepo.create({
        shopId: savedShop.id,
        type: 'topup',
        amountPaise: 50000,
        balanceAfterPaise: 50000,
        referenceId: 'demo-initial-grant',
        description: 'Welcome bonus credit (₹500.00)',
      });
      await this.txRepo.save(topupTx);

      // 5. Create sample contacts
      const contact1 = this.contactRepo.create({
        shopId: savedShop.id,
        waId: '919876543211',
        name: 'Pooja Sharma',
        optedIn: true,
        tags: ['vip', 'regular'],
      });
      const savedContact1 = await this.contactRepo.save(contact1);

      const contact2 = this.contactRepo.create({
        shopId: savedShop.id,
        waId: '919876543212',
        name: 'Rahul Verma',
        optedIn: true,
        tags: ['new'],
      });
      await this.contactRepo.save(contact2);

      // 6. Create sample message history
      const welcomeMsg = this.messageRepo.create({
        shopId: savedShop.id,
        contactId: savedContact1.id,
        direction: 'outbound',
        messageType: 'text',
        gupshupMessageId: 'mock-msg-demo-1',
        status: 'read',
        costPaise: 0,
        payload: { body: 'Hello Pooja! Welcome to Demo Fashion Boutique on WhatsApp ✨' },
      });
      await this.messageRepo.save(welcomeMsg);

      const replyMsg = this.messageRepo.create({
        shopId: savedShop.id,
        contactId: savedContact1.id,
        direction: 'inbound',
        messageType: 'text',
        gupshupMessageId: 'mock-msg-demo-2',
        status: 'delivered',
        costPaise: 0,
        payload: { body: 'Hi! Do you have the summer dresses in stock?' },
      });
      await this.messageRepo.save(replyMsg);

      this.logger.log(`✅ Demo shop created: ${demoEmail} (password: ${demoPassword}) with ₹500 credit and live WhatsApp number`);
    } catch (err: any) {
      if (err?.code === '23505') {
        this.logger.log('Demo shop already created by another process');
      } else {
        this.logger.error(`Failed to seed demo shop: ${err?.message}`, err?.stack);
      }
    }
  }
}
