import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class RefreshController {
  constructor(private authService: AuthService) {}

  @Post('refresh')
  async refresh(@Req() req: Request, @Body() body: { refreshToken: string }): Promise<any> {
    return this.authService.refreshToken(body.refreshToken);
  }
}
