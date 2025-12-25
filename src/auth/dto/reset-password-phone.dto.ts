import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordPhoneDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
