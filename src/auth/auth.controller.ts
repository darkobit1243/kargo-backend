import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterUserDto): Promise<any> {
    return this.authService.register(body);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }): Promise<any> {
    return this.authService.login(body);
  }

  // Token doğru çalışıyor mu test etmek için basit endpoint
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request): Promise<any> {
    const payload = req.user as { sub: string };
    return this.authService.findById(payload.sub);
  }
}
