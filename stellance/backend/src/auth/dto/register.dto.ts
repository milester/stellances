import { IsEmail, IsEnum, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { UserRole } from '../../generated/prisma/client';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
