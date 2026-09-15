import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { User } from './entities/user.entity';
import { Shop } from '../shops/entities/shop.entity';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    return this.dataSource.transaction(async (manager) => {
      const shop = manager.create(Shop, {
        businessName: dto.businessName,
        slug: this.createShopSlug(dto.businessName),
        category: dto.category || undefined,
        status: 'onboarding',
        walletBalancePaise: 0,
      });
      const savedShop = await manager.save(Shop, shop);

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = manager.create(User, {
        email: dto.email,
        passwordHash,
        name: dto.name,
        role: 'shop_owner' as const,
        shopId: savedShop.id,
      });
      const savedUser = await manager.save(User, user);
      await manager.update(Shop, savedShop.id, { ownerUserId: savedUser.id });
      savedShop.ownerUserId = savedUser.id;

      const token = this.generateToken(savedUser);

      return {
        user: {
          id: savedUser.id,
          email: savedUser.email,
          name: savedUser.name,
          role: savedUser.role,
          shopId: savedUser.shopId,
        },
        shop: {
          id: savedShop.id,
          businessName: savedShop.businessName,
          status: savedShop.status,
          walletBalancePaise: Number(savedShop.walletBalancePaise),
        },
        token,
      };
    });
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      relations: { shop: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.generateToken(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        shopId: user.shopId,
      },
      shop: user.shop
        ? {
            id: user.shop.id,
            businessName: user.shop.businessName,
            status: user.shop.status,
            walletBalancePaise: Number(user.shop.walletBalancePaise),
          }
        : null,
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { shop: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      shopId: user.shopId,
      shop: user.shop
        ? {
            id: user.shop.id,
            businessName: user.shop.businessName,
            status: user.shop.status,
            walletBalancePaise: Number(user.shop.walletBalancePaise),
          }
        : null,
    };
  }

  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      shopId: user.shopId,
    });
  }

  private createShopSlug(businessName: string): string {
    const base = businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'shop';

    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}
