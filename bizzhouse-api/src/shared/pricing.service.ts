import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateCard } from '../modules/pricing/entities/rate-card.entity';

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);

  private priceCache: Record<string, number> = {
    'marketing:IN': 150,
    'utility:IN': 30,
    'authentication:IN': 30,
    'service:IN': 0,
    'marketing:DEFAULT': 200,
    'utility:DEFAULT': 50,
    'authentication:DEFAULT': 50,
    'service:DEFAULT': 0,
  };

  constructor(
    @InjectRepository(RateCard)
    private readonly rateCardRepo: Repository<RateCard>,
  ) {}

  async onModuleInit() {
    await this.loadPricesFromDb();
  }

  async loadPricesFromDb() {
    try {
      const cards = await this.rateCardRepo.find();
      if (cards.length > 0) {
        for (const card of cards) {
          const key = `${card.category}:${card.countryCode}`;
          this.priceCache[key] = card.costPaise;
        }
        this.logger.log(`Loaded ${cards.length} rate cards from DB`);
      }
    } catch (err: any) {
      this.logger.warn(`Could not load rate cards from DB, using fallback defaults: ${err.message}`);
    }
  }

  getCost(
    category: 'marketing' | 'utility' | 'authentication' | 'service',
    countryCode = 'IN',
  ): number {
    const key = `${category}:${countryCode}`;
    const defaultKey = `${category}:DEFAULT`;
    return this.priceCache[key] ?? this.priceCache[defaultKey] ?? 100;
  }

  async updatePrices(prices: Record<string, number>) {
    for (const [key, costPaise] of Object.entries(prices)) {
      this.priceCache[key] = costPaise;
      const [category, countryCode] = key.split(':');
      if (category && countryCode) {
        let card = await this.rateCardRepo.findOne({ where: { category, countryCode } });
        if (!card) {
          card = this.rateCardRepo.create({ category, countryCode, costPaise });
        } else {
          card.costPaise = costPaise;
        }
        await this.rateCardRepo.save(card);
      }
    }
    this.logger.log('Price table updated and persisted to DB');
  }

  getPriceTable() {
    return { ...this.priceCache };
  }
}
