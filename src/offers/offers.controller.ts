import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { ForbiddenException } from '@nestjs/common';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  findByListing(
    @Param('listingId') listingId: string,
    @Req() req: Request,
  ): any {
    const payload = req.user as { sub: string };
    return this.offersService.findByListingForOwner(listingId, payload.sub);
  }

  // Owner'ın tüm ilanlarındaki teklifler
  @Get('owner/:ownerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  findByOwner(@Param('ownerId') ownerId: string, @Req() req: Request): any {
    const payload = req.user as { sub: string };
    if (payload.sub !== ownerId) {
      throw new ForbiddenException('Bu kayıtlara erişim yetkiniz yok');
    }
    return this.offersService.findByOwner(ownerId);
  }

  // Teklifi kabul et
  @Post('accept/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  accept(@Param('id') id: string, @Req() req: Request): any {
    const payload = req.user as { sub: string };
    return this.offersService.acceptOffer(id, payload.sub);
  }

  // Teklifi reddet
  @Post('reject/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  reject(@Param('id') id: string, @Req() req: Request): any {
    const payload = req.user as { sub: string };
    return this.offersService.rejectOffer(id, payload.sub);
  }
}
