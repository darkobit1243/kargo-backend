import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';

@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  // Yeni teklif oluştur
  @Post()
  create(@Body() dto: CreateOfferDto): any {
    return this.offersService.create(dto);
  }

  // Belirli listingId'ye ait teklifleri getir
  @Get('listing/:listingId')
  findByListing(@Param('listingId') listingId: string): any {
    return this.offersService.findByListing(listingId);
  }

  // Teklifi kabul et
  @Post('accept/:id')
  accept(@Param('id') id: string): any {
    return this.offersService.acceptOffer(id);
  }

  // Teklifi reddet
  @Post('reject/:id')
  reject(@Param('id') id: string): any {
    return this.offersService.rejectOffer(id);
  }
}
