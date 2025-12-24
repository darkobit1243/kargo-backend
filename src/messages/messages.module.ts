import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './message.entity';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { WsModule } from '../ws/ws.module';
import { AuthModule } from '../auth/auth.module';
import { Offer } from '../offers/offer.entity';
import { Listing } from '../listings/listing.entity';
import { User } from '../auth/user.entity';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Offer, Listing, User]),
    WsModule,
    AuthModule,
    PushModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
