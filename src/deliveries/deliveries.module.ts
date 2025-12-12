import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { WsModule } from '../ws/ws.module';
import { Delivery } from './delivery.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [WsModule, TypeOrmModule.forFeature([Delivery]), AuthModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
