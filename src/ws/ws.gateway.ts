import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from '../messages/messages.service';

@WebSocketGateway({ cors: true })
export class WsGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly messagesService: MessagesService) {}

  sendOfferNotification(listingId: string, offer: any) {
    this.server.emit(`offer_${listingId}`, offer);
  }

  sendDeliveryUpdate(deliveryId: string, update: any) {
    this.server.emit(`delivery_${deliveryId}`, update);
  }

  sendMessage(listingId: string, message: any) {
    this.server.emit(`message_${listingId}`, message);
    if (message?.senderId) {
      this.server.emit(`message_user_${message.senderId}`, message);
    }
    if (message?.carrierId) {
      this.server.emit(`message_user_${message.carrierId}`, message);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(@MessageBody() payload: any, @ConnectedSocket() client: Socket) {
    // payload: { listingId, senderId, carrierId, content }
    if (!payload?.listingId || !payload?.content) return;
    const fromCarrier = payload.senderId && payload.carrierId && payload.senderId === payload.carrierId;
    const message = await this.messagesService.create({
      listingId: payload.listingId,
      senderId: payload.senderId,
      carrierId: payload.carrierId,
      content: payload.content,
      fromCarrier,
    });
    this.server.emit(`message_${payload.listingId}`, message);
    if (message?.senderId) {
      this.server.emit(`message_user_${message.senderId}`, message);
    }
    if (message?.carrierId) {
      this.server.emit(`message_user_${message.carrierId}`, message);
    }
  }
}
