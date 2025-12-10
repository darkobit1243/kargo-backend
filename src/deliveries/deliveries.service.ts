import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WsGateway } from '../ws/ws.gateway';
import { Delivery } from './delivery.entity';

@Injectable()
export class DeliveriesService {
  constructor(
    private wsGateway: WsGateway,
    @InjectRepository(Delivery)
    private readonly deliveriesRepository: Repository<Delivery>,
  ) {}

  async create(dto: { listingId: string }): Promise<Delivery> {
    const delivery = this.deliveriesRepository.create({
      listingId: dto.listingId,
      status: 'pickup_pending',
    });
    return this.deliveriesRepository.save(delivery);
  }

  async pickup(id: string, carrierId: string): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (delivery && delivery.status === 'pickup_pending') {
      delivery.carrierId = carrierId;
      delivery.status = 'in_transit';
      delivery.pickupAt = new Date();
      const saved = await this.deliveriesRepository.save(delivery);
      this.wsGateway.sendDeliveryUpdate(id, saved);
      return saved;
    }
    return delivery ?? null;
  }

  async deliver(id: string): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (delivery && delivery.status === 'in_transit') {
      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();
      const saved = await this.deliveriesRepository.save(delivery);
      this.wsGateway.sendDeliveryUpdate(id, saved);
      return saved;
    }
    return delivery ?? null;
  }

  async findOne(id: string): Promise<Delivery | null> {
    return this.deliveriesRepository.findOne({ where: { id } });
  }

  async findByListing(listingId: string): Promise<Delivery | null> {
    return this.deliveriesRepository.findOne({ where: { listingId } });
  }

  async findByCarrier(carrierId: string): Promise<Delivery[]> {
    return this.deliveriesRepository.find({ where: { carrierId } });
  }
}
