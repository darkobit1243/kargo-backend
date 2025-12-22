import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/user.entity';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
