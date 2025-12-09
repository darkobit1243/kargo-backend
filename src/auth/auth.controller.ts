import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() body: { email: string; password: string }): Promise<any> {
    return this.authService.register(body);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }): Promise<any> {
    return this.authService.login(body);
  }
}
