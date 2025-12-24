import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from './user.entity';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expiresIn = config.get<string>('JWT_EXPIRES_IN', '365d');
        return {
          secret: config.get<string>('JWT_SECRET', 'change_this_in_production'),
          // NestJS JWT v11'de tip uyuşmazlığını önlemek için string değeri cast ediyoruz.
          signOptions: { expiresIn: expiresIn as any },
        };
      },
    }),
  ],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
