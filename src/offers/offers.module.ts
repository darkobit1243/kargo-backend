import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { WsModule } from '../ws/ws.module';
import { Offer } from './offer.entity';
import { Delivery } from '../deliveries/delivery.entity';

@Module({
  imports: [WsModule, TypeOrmModule.forFeature([Offer, Delivery])],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
