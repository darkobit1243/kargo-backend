import { IsString, IsNotEmpty, IsNumber, Min, Max, IsOptional } from 'class-validator';

export class CreateRatingDto {
  @IsString()
  @IsNotEmpty()
  deliveryId: string; // İlgili teslimat

  @IsNumber()
  @Min(1)
  @Max(5)
  score: number; // 1–5

  @IsOptional()
  @IsString()
  comment?: string; // Opsiyonel
}
