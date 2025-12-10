import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ListingsModule } from './listings/listings.module';
import { OffersModule } from './offers/offers.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { WsModule } from './ws/ws.module';
import { RatingsModule } from './ratings/ratings.module';
import { User } from './auth/user.entity';
import { Listing } from './listings/listing.entity';
import { Offer } from './offers/offer.entity';
import { Delivery } from './deliveries/delivery.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        entities: [User, Listing, Offer, Delivery],
        synchronize: config.get<string>('DB_SYNC', 'true') === 'true',
        ssl:
          config.get<string>('DB_SSL', 'false') === 'true'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    AuthModule,
    ListingsModule,
    OffersModule,
    DeliveriesModule,
    WsModule,
    RatingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
