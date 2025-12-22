import { Controller, Post, Param, Body, Get, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { ConfirmDeliveryDto } from './dto/confirm-delivery.dto';
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
  pickup(@Param('id') id: string, @Req() req: Request, @Body() body: { qrToken?: string }) {
    const payload = req.user as { sub: string };
    return this.deliveriesService.pickup(id, payload.sub, body?.qrToken);
  }

  @Post(':id/location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  updateLocation(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: { lat: number; lng: number },
  ) {
    const payload = req.user as { sub: string };
    return this.deliveriesService.updateLocation(id, payload.sub, Number(body.lat), Number(body.lng));
  }

  @Post(':id/deliver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  deliver(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as { sub: string };
    return this.deliveriesService.deliver(id, payload.sub);
  }

  @Post(':id/at-door')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  atDoor(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as { sub: string };
    return this.deliveriesService.markAtDoor(id, payload.sub);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender', 'carrier')
  cancel(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as { sub: string; role: 'sender' | 'carrier' };
    return this.deliveriesService.cancel(id, { id: payload.sub, role: payload.role });
  }

  @Post(':id/dispute')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender', 'carrier')
  dispute(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as { sub: string; role: 'sender' | 'carrier' };
    return this.deliveriesService.dispute(id, { id: payload.sub, role: payload.role });
  }

  @Post(':id/send-delivery-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  sendDeliveryCode(@Param('id') id: string, @Req() req: Request) {
    const payload = req.user as { sub: string };
    return this.deliveriesService.sendDeliveryCode(id, payload.sub);
  }

  @Post(':id/confirm-delivery')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  confirmDelivery(@Param('id') id: string, @Req() req: Request, @Body() body: ConfirmDeliveryDto) {
    const payload = req.user as { sub: string };
    return this.deliveriesService.confirmDeliveryWithFirebaseToken(id, payload.sub, body.idToken);
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
