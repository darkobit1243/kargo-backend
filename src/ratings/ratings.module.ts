import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { Rating } from './rating.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Listing } from '../listings/listing.entity';
import { User } from '../auth/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Rating, Delivery, Listing, User]),
  ],
  controllers: [RatingsController],
  providers: [RatingsService],
  exports: [RatingsService],
})
export class RatingsModule {}
