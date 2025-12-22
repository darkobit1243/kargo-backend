import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmDeliveryDto {
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
