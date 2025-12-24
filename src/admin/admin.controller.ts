import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  Put,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  async verifyUser(@Param('userId') userId: string) {
    return this.adminService.verifyUser(userId, true);
  }

  @Post('reject/:userId')
  async rejectUser(@Param('userId') userId: string) {
    return this.adminService.verifyUser(userId, false);
  }

  @Post('ban/:userId')
  async banUser(@Param('userId') userId: string) {
    return this.adminService.setUserActiveStatus(userId, false);
  }

  @Post('unban/:userId')
  async unbanUser(@Param('userId') userId: string) {
    return this.adminService.setUserActiveStatus(userId, true);
  }
}
