import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  message?: string;
}
