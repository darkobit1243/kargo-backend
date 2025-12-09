import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header missing');
    }

    const [, token] = authHeader.split(' ');
    if (!token) {
      throw new UnauthorizedException('Invalid authorization header format');
    }

    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'change_this_in_production');
      const payload = this.jwtService.verify(token, { secret });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
