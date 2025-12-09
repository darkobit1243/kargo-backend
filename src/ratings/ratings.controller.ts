import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingDto } from './dto/rating.dto';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // Yeni rating oluştur
  @Post()
  create(@Body() dto: CreateRatingDto): RatingDto {
    return this.ratingsService.create(dto) as RatingDto;
  }

  // Belirli kullanıcıya ait ratingleri getir
  @Get('user/:userId')
  findByUser(@Param('userId') userId: string): RatingDto[] {
    return this.ratingsService.findByUser(userId) as RatingDto[];
  }

  // Belirli kullanıcı için ortalama puanı getir
  @Get('average/:userId')
  averageScore(@Param('userId') userId: string) {
    return { average: this.ratingsService.getAverageScore(userId) };
  }
}
