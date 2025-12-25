import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../auth/user.entity';
import { Listing } from '../listings/listing.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { AdminAuditLog } from './admin-audit-log.entity';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Listing, Delivery, AdminAuditLog]),
    AuthModule,
    PushModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule { }
