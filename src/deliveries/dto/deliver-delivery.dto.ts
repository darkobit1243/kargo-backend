import {
  IsBoolean,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class DeliverProofGpsDto {
  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;
}

class DeliverProofDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliverProofGpsDto)
  gps?: DeliverProofGpsDto;

  @IsOptional()
  @IsString()
  receiver_name?: string;

  @IsOptional()
  @IsString()
  signature_url?: string;
}

export class DeliverDeliveryDto {
  @IsBoolean()
  delivered: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliverProofDto)
  proof?: DeliverProofDto;
}
