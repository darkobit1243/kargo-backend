import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { WsModule } from '../ws/ws.module';
import { Offer } from './offer.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Listing } from '../listings/listing.entity';
import { Message } from '../messages/message.entity';
import { User } from '../auth/user.entity';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [WsModule, TypeOrmModule.forFeature([Offer, Delivery, Listing, Message, User]), AuthModule, PushModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
