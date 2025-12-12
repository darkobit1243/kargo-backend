import { Controller, Get, Post, Body, Param, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { CreateListingDto } from './dto/create-listing.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@Controller('listings')
export class ListingsController {
  constructor(private listingsService: ListingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('sender')
  create(@Req() req: Request, @Body() dto: CreateListingDto) {
    const payload = req.user as { sub: string };
    return this.listingsService.create({
      ...dto,
      ownerId: payload.sub,
    });
  }

  @Get()
  findAll() {
    return this.listingsService.findAll();
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
