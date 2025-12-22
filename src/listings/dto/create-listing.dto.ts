import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DimensionsDto {
  @IsNumber()
  length: number;

  @IsNumber()
  width: number;

  @IsNumber()
  height: number;
}

class LocationDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

export class CreateListingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsString({ each: true })
  photos: string[];

  @IsNumber()
  weight: number;

  @ValidateNested()
  @Type(() => DimensionsDto)
  dimensions: DimensionsDto;

  @IsBoolean()
  fragile: boolean;

  @ValidateNested()
  @Type(() => LocationDto)
  pickup_location: LocationDto;

  @ValidateNested()
  @Type(() => LocationDto)
  dropoff_location: LocationDto;

  @IsOptional()
  @IsString()
  receiver_phone?: string;
}
