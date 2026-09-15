import { IsEmail, IsString, MinLength, Matches, IsOptional, IsInt, Min, IsUUID } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[a-zA-Z]/, { message: 'Password must contain a letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  businessName: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class LoginDto {
  // Deliberately permissive: logins like "admin@123" are valid identifiers
  // even though they are not RFC-5322 emails (registration still enforces
  // real emails via @IsEmail).
  @Matches(/^[^\s@]+@[^\s@]+$/, {
    message: 'Identifier must look like user@host (e.g. admin@123)',
  })
  email: string;

  @IsString()
  password: string;
}

export class AdminCreditDto {
  @IsUUID()
  shopId: string;

  @IsInt()
  @Min(1, { message: 'Amount must be at least 1 paise' })
  amountPaise: number;

  @IsOptional()
  @IsString()
  description?: string;
}
