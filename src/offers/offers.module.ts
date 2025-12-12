import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { WsModule } from '../ws/ws.module';
import { Offer } from './offer.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [WsModule, TypeOrmModule.forFeature([Offer, Delivery]), AuthModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
