import { Controller, Post, Param, Body, Get, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  create(@Body() dto: { listingId: string }) {
    return this.deliveriesService.create(dto);
  }

  @Post(':id/pickup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  pickup(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as { sub: string };
    return this.deliveriesService.pickup(id, payload.sub);
  }

  @Post(':id/deliver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  deliver(@Param('id') id: string) {
    return this.deliveriesService.deliver(id);
  }

  @Get('by-listing/:listingId')
  findByListing(@Param('listingId') listingId: string) {
    return this.deliveriesService.findByListing(listingId);
  }

  @Get('by-owner/:ownerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  findByOwner(@Param('ownerId') ownerId: string, @Req() req: Request) {
    const payload = req.user as { sub: string };
    if (payload.sub !== ownerId) {
      throw new ForbiddenException('Kendi teslimatlarına erişim yetkiniz yok');
    }
    return this.deliveriesService.findByOwner(ownerId);
  }

  @Get('by-carrier/:carrierId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  findByCarrier(@Param('carrierId') carrierId: string, @Req() req: Request) {
    const payload = req.user as { sub: string };
    if (payload.sub !== carrierId) {
      throw new ForbiddenException('Kendi teslimatlarına erişim yetkiniz yok');
    }
    return this.deliveriesService.findByCarrier(carrierId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deliveriesService.findOne(id);
  }
}
