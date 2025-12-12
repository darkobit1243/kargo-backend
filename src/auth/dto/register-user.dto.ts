import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import type { UserRole } from '../user.entity';

export class RegisterUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsEnum(['sender', 'carrier'])
  role: UserRole;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @ValidateIf(o => o.role === 'sender')
  @IsString()
  @IsNotEmpty()
  address?: string;

  @ValidateIf(o => o.role === 'carrier')
  @IsString()
  @IsNotEmpty()
  vehicleType?: string;

  @ValidateIf(o => o.role === 'carrier')
  @IsString()
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  serviceArea?: string;
}

