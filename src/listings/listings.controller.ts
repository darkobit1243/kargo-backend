import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  ForbiddenException,
  Logger,
  Query,
} from '@nestjs/common';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@Controller('listings')
export class ListingsController {
  private readonly logger = new Logger(ListingsController.name);
  constructor(private listingsService: ListingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  create(@Req() req: Request, @Body() dto: CreateListingDto) {
    const payload = req.user as { sub: string };
    const photosCount = Array.isArray(dto.photos) ? dto.photos.length : 0;
    const firstPhotoSize =
      photosCount > 0 && typeof dto.photos[0] === 'string'
        ? dto.photos[0].length
        : 0;
    this.logger.log(
      `create listing: title="${dto.title}" weight=${dto.weight} photos=${photosCount} firstPhotoSize=${firstPhotoSize}`,
    );
    return this.listingsService.create(payload.sub, dto);
  }

  @Get()
  findAll() {
    return this.listingsService.findAll();
  }

  @Get('nearby')
  findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    // Default radius 50km
    const r = radius ? parseFloat(radius) : 50;
    return this.listingsService.findNearby(parseFloat(lat), parseFloat(lng), r);
  }

  @Get('owner/:ownerId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  findByOwner(@Param('ownerId') ownerId: string, @Req() req: Request) {
    const payload = req.user as { sub: string };
    if (payload.sub !== ownerId) {
      throw new ForbiddenException('Bu kayıtlara erişim yetkiniz yok');
    }
    return this.listingsService.findByOwner(ownerId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.listingsService.findOne(id);
  }
}
