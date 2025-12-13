import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
import { MessagesService } from './messages.service';
import { WsGateway } from '../ws/ws.gateway';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService, private readonly wsGateway: WsGateway) {}

  @Get()
  async threads(@Req() req: Request) {
    const payload = req.user as { sub: string };
    return this.messagesService.findThreads(payload.sub);
  }

  @Get(':listingId')
  async history(@Req() req: Request, @Param('listingId') listingId: string) {
    const payload = req.user as { sub: string };
    return this.messagesService.findByListingId(listingId, payload.sub);
  }

  @Post()
  async send(@Req() req: Request, @Body() body: CreateMessageDto) {
    const payload = req.user as { sub: string };
    const message = await this.messagesService.create({
      ...body,
      fromCarrier: payload.sub === body.carrierId,
    });
    this.wsGateway.sendMessage(body.listingId, message);
    return message;
  }

  @Get('contacts')
  async contacts(@Req() req: Request) {
    const payload = req.user as { sub: string };
    return this.messagesService.getCarrierContacts(payload.sub);
  }
}

