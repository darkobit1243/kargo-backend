import { Controller, Post, Param, Body, Get } from '@nestjs/common';
import { DeliveriesService } from './deliveries.service';
import { PickupDeliveryDto } from './dto/pickup-delivery.dto';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Post()
  create(@Body() dto: { listingId: string }) {
    return this.deliveriesService.create(dto);
  }

  @Post(':id/pickup')
  pickup(@Param('id') id: string, @Body() dto: PickupDeliveryDto) {
    return this.deliveriesService.pickup(id, dto.carrierId);
  }

  @Post(':id/deliver')
  deliver(@Param('id') id: string) {
    return this.deliveriesService.deliver(id);
  }

  @Get('by-listing/:listingId')
  findByListing(@Param('listingId') listingId: string) {
    return this.deliveriesService.findByListing(listingId);
  }

   @Get('by-carrier/:carrierId')
   findByCarrier(@Param('carrierId') carrierId: string) {
     return this.deliveriesService.findByCarrier(carrierId);
   }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deliveriesService.findOne(id);
  }
}
