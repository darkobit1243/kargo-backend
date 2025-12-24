import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  Put,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRateLimitGuard } from '../auth/admin-rate-limit.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, AdminRateLimitGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async getUsers(
    @Query('role') role?: string,
    @Query('status') status?: string, // 'pending', 'verified', 'banned'
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getUsers(role, status, search, +page, +limit);
  }

  @Post('verify/:userId')
  async verifyUser(@Param('userId') userId: string, @Req() req) {
    const adminId = req.user?.sub || req.user?.id;
    const user = await this.adminService.verifyUser(userId, true, adminId);
    return {
      success: true,
      message: 'Kullanıcı başarıyla onaylandı.',
      data: user,
    };
  }

  @Post('reject/:userId')
  async rejectUser(@Param('userId') userId: string, @Req() req) {
    const adminId = req.user?.sub || req.user?.id;
    const user = await this.adminService.verifyUser(userId, false, adminId);
    return {
      success: true,
      message: 'Kullanıcı başvurusu reddedildi.',
      data: user,
    };
  }

  @Post('ban/:userId')
  async banUser(@Param('userId') userId: string, @Req() req) {
    const adminId = req.user?.sub || req.user?.id;
    const user = await this.adminService.setUserActiveStatus(userId, false, adminId);
    return {
      success: true,
      message: 'Kullanıcı başarıyla banlandı.',
      data: user,
    };
  }

  @Post('unban/:userId')
  async unbanUser(@Param('userId') userId: string, @Req() req) {
    const adminId = req.user?.sub || req.user?.id;
    const user = await this.adminService.setUserActiveStatus(userId, true, adminId);
    return {
      success: true,
      message: 'Kullanıcı banı kaldırıldı.',
      data: user,
    };
  }
}
