import { IsString, IsNotEmpty } from 'class-validator';

export class CreateDeliveryDto {
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @IsString()
  @IsNotEmpty()
  offerId: string;

  @IsString()
  @IsNotEmpty()
  carrierId: string;
}
