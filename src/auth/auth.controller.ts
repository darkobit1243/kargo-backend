import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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

  @Post('forgot-password')
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
  ): Promise<{ ok: true; debugCode?: string }> {
    return this.authService.requestPasswordReset(body);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto): Promise<{ ok: true }> {
    await this.authService.resetPassword(body);
    return { ok: true };
  }

  // Token doğru çalışıyor mu test etmek için basit endpoint
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request): Promise<any> {
    const payload = req.user as { sub: string };
    return this.authService.findById(payload.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(
    @Req() req: Request,
    @Body()
    body: {
      avatarUrl?: string | null;
      fullName?: string | null;
      phone?: string | null;
      address?: string | null;
      companyName?: string | null;
      taxNumber?: string | null;
      taxOffice?: string | null;
      cityId?: string | null;
      districtId?: string | null;
      city?: string | null;
      district?: string | null;
      activityArea?: string | null;
      vehicleType?: string | null;
      vehiclePlate?: string | null;
      serviceArea?: string | null;
    },
  ): Promise<any> {
    const payload = req.user as { sub: string };
    return this.authService.updateMe(payload.sub, body);
  }

  // Push notification token (FCM)
  @Post('fcm-token')
  @UseGuards(JwtAuthGuard)
  async setFcmToken(
    @Req() req: Request,
    @Body() body: { token?: string | null },
  ): Promise<{ ok: true }> {
    const payload = req.user as { sub: string };
    await this.authService.updateFcmToken(payload.sub, body?.token ?? null);
    return { ok: true };
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard)
  async getUser(@Req() req: Request): Promise<any> {
    const payload = req.user as { sub: string };
    const id = (req.params as any).id as string;
    // JWT doğrulandı; belirtilen id için kullanıcı döner
    return this.authService.findById(id ?? payload.sub);
  }
}
