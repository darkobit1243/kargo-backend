import { IsNotEmpty, IsString } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  listingId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsNotEmpty()
  carrierId: string;
}
