import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: true })
export class WsGateway {
  @WebSocketServer()
  server: Server;

  sendOfferNotification(listingId: string, offer: any) {
    this.server.emit(`offer_${listingId}`, offer);
  }

  sendDeliveryUpdate(deliveryId: string, update: any) {
    this.server.emit(`delivery_${deliveryId}`, update);
  }

  sendMessage(listingId: string, message: any) {
    this.server.emit(`message_${listingId}`, message);
  }
}
