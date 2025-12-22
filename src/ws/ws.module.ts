import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WsGateway } from './ws.gateway';
import { MessagesService } from '../messages/messages.service';
import { Message } from '../messages/message.entity';
import { Offer } from '../offers/offer.entity';
import { Listing } from '../listings/listing.entity';
import { User } from '../auth/user.entity';
import { PushModule } from '../push/push.module';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Offer, Listing, User]), PushModule],
  providers: [WsGateway, MessagesService],
  exports: [WsGateway],
})
export class WsModule {}
