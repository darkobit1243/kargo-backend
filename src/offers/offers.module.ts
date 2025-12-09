import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { OffersController } from './offers.controller';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [WsModule],
  controllers: [OffersController],
  providers: [OffersService],
})
export class OffersModule {}
