import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppInfoController } from './app-info.controller';
import { AuthModule } from './auth/auth.module';
import { ListingsModule } from './listings/listings.module';
import { OffersModule } from './offers/offers.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { WsModule } from './ws/ws.module';
import { RatingsModule } from './ratings/ratings.module';
import { Message } from './messages/message.entity';
import { MessagesModule } from './messages/messages.module';
import { User } from './auth/user.entity';
import { Listing } from './listings/listing.entity';
import { Offer } from './offers/offer.entity';
import { Delivery } from './deliveries/delivery.entity';
import { PushModule } from './push/push.module';
import { CommonModule } from './common/common.module';
import { Rating } from './ratings/rating.entity';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    AdminModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const fallbackUrl =
          'postgresql://postgres:EuBICrJOGohRVSbakjwPHPNEFpzhcth1@postgres.railway.internal:5432/railway';

        const url = config.get<string>('DATABASE_URL') ?? fallbackUrl;
        const sslEnabled = config.get<string>('DB_SSL', 'false') === 'true';

        return {
          type: 'postgres',
          url,
          entities: [User, Listing, Offer, Delivery, Message, Rating],
          synchronize: config.get<string>('DB_SYNC', 'true') === 'true',
          ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    AuthModule,
    ListingsModule,
    OffersModule,
    DeliveriesModule,
    WsModule,
    MessagesModule,
    RatingsModule,
    PushModule,
  ],
  controllers: [AppController, AppInfoController],
  providers: [AppService],
})
export class AppModule { }
