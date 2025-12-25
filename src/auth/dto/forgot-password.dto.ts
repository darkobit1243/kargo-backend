import { IsEmail, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class ForgotPasswordDto {
  // Either email or phone must be provided.
  @ValidateIf((o) => !o.phone)
  @IsEmail()
  @IsOptional()
  email?: string;

  // TR-focused (e.g. 0544..., 544..., +90544...) – normalization happens server-side.
  @ValidateIf((o) => !o.email)
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  phone?: string;
}
