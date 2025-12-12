import { Controller, Post, Get, Param, Body, Req, UseGuards } from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  // Yeni teklif oluştur
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('carrier')
  create(@Req() req: Request, @Body() dto: CreateOfferDto): any {
    const payload = req.user as { sub: string };
    return this.offersService.create({
      ...dto,
      proposerId: payload.sub,
    });
  }

  // Belirli listingId'ye ait teklifleri getir
  @Get('listing/:listingId')
  findByListing(@Param('listingId') listingId: string): any {
    return this.offersService.findByListing(listingId);
  }

  // Teklifi kabul et
  @Post('accept/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  accept(@Param('id') id: string): any {
    return this.offersService.acceptOffer(id);
  }

  // Teklifi reddet
  @Post('reject/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  reject(@Param('id') id: string): any {
    return this.offersService.rejectOffer(id);
  }
}
