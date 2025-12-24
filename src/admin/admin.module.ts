import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../auth/user.entity';
import { Listing } from '../listings/listing.entity';
import { Delivery } from '../deliveries/delivery.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Listing, Delivery])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
