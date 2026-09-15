import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepo: any;
  let mockDataSource: any;
  let mockJwtService: any;

  beforeEach(() => {
    mockUserRepo = {
      findOne: vi.fn(),
    };

    mockDataSource = {
      transaction: vi.fn(async (cb: any) => {
        const mockManager = {
          create: vi.fn((entityClass, data) => ({ id: 'generated-id', ...data })),
          save: vi.fn(async (entityClass, data) => data),
          update: vi.fn(async () => {}),
        };
        return cb(mockManager);
      }),
    };

    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    service = new AuthService(mockUserRepo, mockDataSource, mockJwtService);
  });

  describe('register', () => {
    it('should throw ConflictException if email already registered', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Password123!',
          name: 'John Doe',
          businessName: 'My Store',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create shop and user inside a transaction and return token', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await service.register({
        email: 'new@example.com',
        password: 'Password123!',
        name: 'Jane Doe',
        businessName: 'Jane Store',
      });

      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.email).toBe('new@example.com');
      expect(result.shop.businessName).toBe('Jane Store');
      expect(mockJwtService.sign).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on invalid password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        passwordHash,
      });

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return user and token on valid credentials', async () => {
      const passwordHash = await bcrypt.hash('secret123', 10);
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
        role: 'shop_owner',
        passwordHash,
        shop: {
          id: 'shop-1',
          businessName: 'User Shop',
          status: 'active',
          walletBalancePaise: 5000,
        },
      });

      const result = await service.login({
        email: 'user@example.com',
        password: 'secret123',
      });

      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.email).toBe('user@example.com');
      expect(result.shop?.walletBalancePaise).toBe(5000);
    });
  });
});
