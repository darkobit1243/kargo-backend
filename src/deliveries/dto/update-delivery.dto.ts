import { IsBoolean, IsOptional, IsString, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class UpdateProofGpsDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

class UpdateProofDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProofGpsDto)
  gps?: UpdateProofGpsDto;

  @IsOptional()
  @IsString()
  receiver_name?: string;

  @IsOptional()
  @IsString()
  signature_url?: string;
}

export class UpdateDeliveryDto {
  @IsOptional()
  @IsBoolean()
  delivered?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProofDto)
  proof?: UpdateProofDto;
}
