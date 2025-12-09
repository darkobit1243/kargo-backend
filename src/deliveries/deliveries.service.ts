import { Injectable } from '@nestjs/common';
import { WsGateway } from '../ws/ws.gateway';

export interface Delivery {
  id: string;
  listingId: string;
  carrierId?: string;
  status: 'pickup_pending' | 'in_transit' | 'delivered';
}

@Injectable()
export class DeliveriesService {
  private deliveries: Delivery[] = [];

  constructor(private wsGateway: WsGateway) {}

  create(dto: { listingId: string }): Delivery {
    const delivery: Delivery = { id: Date.now().toString(), listingId: dto.listingId, status: 'pickup_pending' };
    this.deliveries.push(delivery);
    return delivery;
  }

  pickup(id: string, carrierId: string): Delivery | undefined {
    const delivery = this.deliveries.find(d => d.id === id);
    if (delivery && delivery.status === 'pickup_pending') {
      delivery.carrierId = carrierId;
      delivery.status = 'in_transit';
      this.wsGateway.sendDeliveryUpdate(id, delivery);
    }
    return delivery;
  }

  deliver(id: string): Delivery | undefined {
    const delivery = this.deliveries.find(d => d.id === id);
    if (delivery && delivery.status === 'in_transit') {
      delivery.status = 'delivered';
      this.wsGateway.sendDeliveryUpdate(id, delivery);
    }
    return delivery;
  }

  findOne(id: string): Delivery | undefined {
    return this.deliveries.find(d => d.id === id);
  }
}
