import { Injectable } from '@nestjs/common';
import { CreateRatingDto } from './dto/create-rating.dto';

interface Rating extends CreateRatingDto {
  id: string;
}

@Injectable()
export class RatingsService {
  private ratings: Rating[] = [];

  create(dto: CreateRatingDto): Rating {
    const newRating: Rating = { id: (Math.random() * 100000).toFixed(0), ...dto };
    this.ratings.push(newRating);
    return newRating;
  }

  findByUser(userId: string): Rating[] {
    return this.ratings.filter(r => r.toUserId === userId);
  }

  getAverageScore(userId: string): number {
    const userRatings = this.findByUser(userId);
    if (!userRatings.length) return 0;
    return userRatings.reduce((sum, r) => sum + r.score, 0) / userRatings.length;
  }
}
