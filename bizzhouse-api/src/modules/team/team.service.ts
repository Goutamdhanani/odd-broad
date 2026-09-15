import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../auth/entities/user.entity';

/**
 * Shop team management: the shop owner invites agents (shop_staff).
 * Agents authenticate with the same JWT flow and can work the shop's
 * inbox; only the owner can manage the team.
 */
@Injectable()
export class TeamService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async list(shopId: string) {
    const users = await this.userRepo.find({
      where: { shopId },
      order: { createdAt: 'ASC' },
    });
    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
    };
  }

  async invite(
    shopId: string,
    dto: { email: string; password: string; name: string },
  ) {
    const email = dto.email?.trim().toLowerCase();
    if (!email || !dto.password || !dto.name?.trim()) {
      throw new BadRequestException('email, password and name are required');
    }
    if (dto.password.length < 8 || !/[a-zA-Z]/.test(dto.password) || !/[0-9]/.test(dto.password)) {
      throw new BadRequestException(
        'Agent password must be at least 8 characters with a letter and a number',
      );
    }

    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const agent = this.userRepo.create({
      email,
      passwordHash,
      name: dto.name.trim().slice(0, 80),
      role: 'shop_staff',
      shopId,
    });
    const saved = await this.userRepo.save(agent);

    return {
      id: saved.id,
      email: saved.email,
      name: saved.name,
      role: saved.role,
      createdAt: saved.createdAt,
      // Shown once so the owner can hand it over; never stored in plaintext
      initialPassword: dto.password,
    };
  }

  async remove(shopId: string, userId: string) {
    const agent = await this.userRepo.findOne({ where: { id: userId, shopId } });
    if (!agent) throw new NotFoundException('Team member not found');
    if (agent.role === 'shop_owner') {
      throw new BadRequestException('The shop owner cannot be removed');
    }
    await this.userRepo.remove(agent);
    return { deleted: true };
  }
}
