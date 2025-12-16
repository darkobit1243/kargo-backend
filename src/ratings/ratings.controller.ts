import { Controller, Post, Get, Body, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingDto } from './dto/rating.dto';

@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  // Kullanıcının verdiği ratingleri getir (fromUserId = JWT.sub)
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async mine(@Req() req: Request): Promise<RatingDto[]> {
    const payload = req.user as { sub: string };
    return (await this.ratingsService.findGivenByUser(payload.sub)) as RatingDto[];
  }

  // Yeni rating oluştur
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: Request, @Body() dto: CreateRatingDto): Promise<RatingDto> {
    const payload = req.user as { sub: string };
    return (await this.ratingsService.create(payload.sub, dto)) as RatingDto;
  }

  // Belirli kullanıcıya ait ratingleri getir
  @Get('user/:userId')
  async findByUser(@Param('userId') userId: string): Promise<RatingDto[]> {
    return (await this.ratingsService.findByUser(userId)) as RatingDto[];
  }

  // Belirli kullanıcı için ortalama puanı getir
  @Get('average/:userId')
  async averageScore(@Param('userId') userId: string): Promise<{ average: number }> {
    return { average: await this.ratingsService.getAverageScore(userId) };
  }
}
