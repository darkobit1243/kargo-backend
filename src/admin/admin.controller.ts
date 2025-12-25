import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
  Req,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminRateLimitGuard } from '../auth/admin-rate-limit.guard';
import type { Request } from 'express';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, AdminRateLimitGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  private getAuditMeta(req: Request) {
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] ?? req.ip ?? null)?.toString();
    const userAgent = req.headers['user-agent']?.toString() ?? null;
    return { ip, userAgent };
  }

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

  @Get('listings')
  async getListings(
    @Query('status') status?: 'active' | 'hidden',
    @Query('ownerId') ownerId?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getListings({
      status,
      ownerId,
      search,
      page: +page,
      limit: +limit,
    });
  }

  @Get('deliveries')
  async getDeliveries(
    @Query('status') status?: any,
    @Query('listingId') listingId?: string,
    @Query('ownerId') ownerId?: string,
    @Query('carrierId') carrierId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getDeliveries({
      status,
      listingId,
      ownerId,
      carrierId,
      page: +page,
      limit: +limit,
    });
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.adminService.getAuditLogs(action, adminId, targetType, targetId, +page, +limit);
  }

  @Get('listings/:listingId')
  async getListingDetails(@Param('listingId') listingId: string) {
    return this.adminService.getListingDetails(listingId);
  }

  @Get('deliveries/:deliveryId')
  async getDeliveryDetails(@Param('deliveryId') deliveryId: string) {
    return this.adminService.getDeliveryDetails(deliveryId);
  }

  @Post('verify/:userId')
  async verifyUser(@Param('userId') userId: string, @Req() req: Request) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const user = await this.adminService.verifyUser(userId, true, {
      adminId,
      meta: this.getAuditMeta(req),
    });
    return {
      success: true,
      message: 'Kullanıcı başarıyla onaylandı.',
      data: user,
    };
  }

  @Post('reject/:userId')
  async rejectUser(@Param('userId') userId: string, @Req() req: Request) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const user = await this.adminService.verifyUser(userId, false, {
      adminId,
      meta: this.getAuditMeta(req),
    });
    return {
      success: true,
      message: 'Kullanıcı başvurusu reddedildi.',
      data: user,
    };
  }

  @Post('ban/:userId')
  async banUser(@Param('userId') userId: string, @Req() req: Request) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const user = await this.adminService.setUserActiveStatus(userId, false, {
      adminId,
      meta: this.getAuditMeta(req),
    });
    return {
      success: true,
      message: 'Kullanıcı başarıyla banlandı.',
      data: user,
    };
  }

  @Post('unban/:userId')
  async unbanUser(@Param('userId') userId: string, @Req() req: Request) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const user = await this.adminService.setUserActiveStatus(userId, true, {
      adminId,
      meta: this.getAuditMeta(req),
    });
    return {
      success: true,
      message: 'Kullanıcı banı kaldırıldı.',
      data: user,
    };
  }

  @Post('listings/:listingId/hide')
  async hideListing(
    @Param('listingId') listingId: string,
    @Req() req: Request,
    @Body() body: { reason?: string | null },
  ) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const data = await this.adminService.setListingActiveStatus(listingId, false, {
      adminId,
      meta: this.getAuditMeta(req),
      reason: body?.reason ?? null,
    });
    return { success: true, message: 'İlan yayından kaldırıldı.', data };
  }

  @Post('listings/:listingId/unhide')
  async unhideListing(
    @Param('listingId') listingId: string,
    @Req() req: Request,
    @Body() body: { reason?: string | null },
  ) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const data = await this.adminService.setListingActiveStatus(listingId, true, {
      adminId,
      meta: this.getAuditMeta(req),
      reason: body?.reason ?? null,
    });
    return { success: true, message: 'İlan yeniden yayına alındı.', data };
  }

  @Post('deliveries/:deliveryId/force-cancel')
  async forceCancelDelivery(
    @Param('deliveryId') deliveryId: string,
    @Req() req: Request,
    @Body() body: { reason?: string | null },
  ) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const data = await this.adminService.forceCancelDelivery(deliveryId, {
      adminId,
      meta: this.getAuditMeta(req),
      reason: body?.reason ?? null,
    });
    return { success: true, message: 'Teslimat iptal edildi.', data };
  }

  @Post('deliveries/:deliveryId/resolve-dispute')
  async resolveDispute(
    @Param('deliveryId') deliveryId: string,
    @Req() req: Request,
    @Body() body: { outcome: 'cancelled' | 'delivered'; note?: string | null },
  ) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    const data = await this.adminService.resolveDeliveryDispute(
      deliveryId,
      body?.outcome,
      {
        adminId,
        meta: this.getAuditMeta(req),
        note: body?.note ?? null,
      },
    );
    return { success: true, message: 'Dispute çözümlendi.', data };
  }

  @Post('push/user/:userId')
  async pushToUser(
    @Param('userId') userId: string,
    @Req() req: Request,
    @Body() body: { title: string; body: string; data?: Record<string, string> },
  ) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    return this.adminService.sendPushToUser({
      userId,
      title: body.title,
      body: body.body,
      data: body.data,
      adminId,
      meta: this.getAuditMeta(req),
    });
  }

  @Post('push/broadcast')
  async broadcastPush(
    @Req() req: Request,
    @Body()
    body: {
      title: string;
      body: string;
      role?: 'sender' | 'carrier' | 'admin';
      onlyActive?: boolean;
      limit?: number;
      data?: Record<string, string>;
    },
  ) {
    const adminId = (req.user as any)?.sub || (req.user as any)?.id;
    return this.adminService.broadcastPush({
      title: body.title,
      body: body.body,
      role: body.role,
      onlyActive: body.onlyActive,
      limit: body.limit,
      data: body.data,
      adminId,
      meta: this.getAuditMeta(req),
    });
  }
}
