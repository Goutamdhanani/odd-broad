import { SetMetadata } from '@nestjs/common';
import { User } from '../../modules/auth/entities/user.entity';

export const ROLES_KEY = 'roles';
export type UserRole = User['role'];
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
