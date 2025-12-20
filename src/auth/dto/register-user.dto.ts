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

  // Sender required fields
  @IsOptional()
  @IsString()
  address?: string;

  @ValidateIf(o => o.role === 'sender')
  @IsString()
  @IsNotEmpty()
  companyName?: string;

  @ValidateIf(o => o.role === 'sender')
  @IsString()
  @IsNotEmpty()
  taxNumber?: string;

  @ValidateIf(o => o.role === 'sender')
  @IsString()
  @IsNotEmpty()
  taxOffice?: string;

  @ValidateIf(o => o.role === 'sender')
  @IsString()
  @IsNotEmpty()
  activityArea?: string;

  // Sender location (optional but recommended)
  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  districtId?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @ValidateIf(o => o.role === 'sender')
  @IsString()
  @IsNotEmpty()
  avatarUrl?: string;

  // Carrier required fields
  @ValidateIf(o => o.role === 'carrier')
  @IsString()
  @IsNotEmpty()
  vehicleType?: string;

  @ValidateIf(o => o.role === 'carrier')
  @IsString()
  @IsNotEmpty()
  vehiclePlate?: string;

  @IsOptional()
  @IsString()
  serviceArea?: string;

  // Optional stats
  @IsOptional()
  rating?: number;

  @IsOptional()
  deliveredCount?: number;
}

