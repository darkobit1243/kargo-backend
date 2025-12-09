import { IsString, IsNotEmpty } from 'class-validator';

export class PickupDeliveryDto {
  @IsString()
  @IsNotEmpty()
  carrierId: string;
}
