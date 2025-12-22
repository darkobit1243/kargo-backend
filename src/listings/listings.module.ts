import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { Listing } from './listing.entity';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/user.entity';
import { Offer } from '../offers/offer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Listing, User, Offer]), AuthModule],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
