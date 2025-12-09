import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateOfferDto {
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @IsString()
  @IsNotEmpty()
  proposerId: string; // B kullanıcı ID

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  message?: string;
}
