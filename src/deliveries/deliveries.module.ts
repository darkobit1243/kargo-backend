import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { WsModule } from '../ws/ws.module';
import { Delivery } from './delivery.entity';
import { Listing } from '../listings/listing.entity';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/user.entity';
import { SmsModule } from '../sms/sms.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [WsModule, TypeOrmModule.forFeature([Delivery, Listing, User]), AuthModule, SmsModule, PushModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
