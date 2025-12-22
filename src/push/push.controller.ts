import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../auth/user.entity';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(
    private readonly pushService: PushService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  @Post('test')
  @UseGuards(JwtAuthGuard)
  async testSelf(
    @Req() req: Request,
    @Body() body: { title?: string; body?: string },
  ): Promise<{ ok: boolean; enabled: boolean; hasToken: boolean }>
  {
    const payload = req.user as { sub: string };
    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
    const token = user?.fcmToken?.toString().trim();
    const hasToken = Boolean(token);

    if (!token) {
      return { ok: false, enabled: this.pushService.isEnabled(), hasToken };
    }

    const ok = await this.pushService.sendToToken({
      token,
      title: (body?.title ?? 'Test').toString(),
      body: (body?.body ?? 'Push test bildirimi').toString(),
      data: { type: 'test' },
    });

    return { ok, enabled: this.pushService.isEnabled(), hasToken };
  }
}
