import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WsGateway } from '../ws/ws.gateway';
import { Delivery } from './delivery.entity';
import { Listing } from '../listings/listing.entity';
import { User } from '../auth/user.entity';

@Injectable()
export class DeliveriesService {
  constructor(
    private wsGateway: WsGateway,
    @InjectRepository(Delivery)
    private readonly deliveriesRepository: Repository<Delivery>,
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  private async bumpDeliveredCount(userId: string): Promise<void> {
    await this.usersRepository
      .createQueryBuilder()
      .update(User)
      .set({
        deliveredCount: () => 'COALESCE("deliveredCount", 0) + 1',
      })
      .where('id = :id', { id: userId })
      .execute();
  }

  private generateQrToken(): string {
    // Short, URL-safe token (no external dependency).
    const rnd = () => Math.random().toString(36).slice(2);
    return `${rnd()}${rnd()}`.slice(0, 24);
  }

  async create(dto: { listingId: string }): Promise<Delivery> {
    const delivery = this.deliveriesRepository.create({
      listingId: dto.listingId,
      status: 'pickup_pending',
      pickupQrToken: this.generateQrToken(),
      trackingEnabled: false,
    });
    return this.deliveriesRepository.save(delivery);
  }

  async pickup(id: string, carrierId: string, qrToken?: string): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (delivery && delivery.status === 'pickup_pending') {
      if (!qrToken || !delivery.pickupQrToken || qrToken !== delivery.pickupQrToken) {
        throw new BadRequestException('QR doğrulaması gerekli');
      }
      delivery.carrierId = carrierId;
      delivery.status = 'in_transit';
      delivery.pickupAt = new Date();
      delivery.trackingEnabled = true;
      const saved = await this.deliveriesRepository.save(delivery);
      this.wsGateway.sendDeliveryUpdate(id, saved);
      return saved;
    }
    return delivery ?? null;
  }

  async deliver(id: string, carrierId: string): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (delivery && delivery.status === 'in_transit') {
      if (delivery.carrierId && delivery.carrierId !== carrierId) {
        throw new ForbiddenException('Bu teslimatın taşıyıcısı değilsiniz');
      }
      if (!delivery.carrierId) {
        throw new BadRequestException('Teslimatın taşıyıcısı yok');
      }

      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();
      const saved = await this.deliveriesRepository.save(delivery);

      // Update delivery stats
      await this.bumpDeliveredCount(delivery.carrierId);
      const listing = await this.listingsRepository.findOne({ where: { id: delivery.listingId } });
      if (listing?.ownerId) {
        await this.bumpDeliveredCount(listing.ownerId);
      }

      this.wsGateway.sendDeliveryUpdate(id, saved);
      return saved;
    }
    return delivery ?? null;
  }

  async updateLocation(id: string, carrierId: string, lat: number, lng: number): Promise<Delivery> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat bulunamadı');
    }
    if (delivery.carrierId && delivery.carrierId !== carrierId) {
      throw new ForbiddenException('Bu teslimatın taşıyıcısı değilsiniz');
    }
    if (delivery.status !== 'in_transit') {
      throw new BadRequestException('Konum güncelleme yalnızca yoldayken yapılabilir');
    }
    if (!delivery.trackingEnabled) {
      throw new BadRequestException('Canlı takip aktif değil');
    }
    delivery.lastLat = lat;
    delivery.lastLng = lng;
    delivery.lastLocationAt = new Date();
    const saved = await this.deliveriesRepository.save(delivery);
    this.wsGateway.sendDeliveryUpdate(id, saved);
    return saved;
  }

  async findOne(id: string): Promise<Delivery | null> {
    return this.deliveriesRepository.findOne({ where: { id } });
  }

  async findByListing(listingId: string): Promise<Delivery | null> {
    return this.deliveriesRepository.findOne({ where: { listingId } });
  }

  async findByCarrier(carrierId: string): Promise<Delivery[]> {
    const deliveries = await this.deliveriesRepository.find({ where: { carrierId } });
    const toFix = deliveries
      .filter(d => d.status === 'pickup_pending' && (!d.pickupQrToken || d.pickupQrToken.trim().length === 0))
      .map(d => {
        // eslint-disable-next-line no-param-reassign
        d.pickupQrToken = this.generateQrToken();
        return d;
      });
    if (toFix.length > 0) {
      await this.deliveriesRepository.save(toFix);
    }
    return deliveries;
  }

  async findByOwner(ownerId: string): Promise<Delivery[]> {
    const listings = await this.listingsRepository.find({ where: { ownerId } });
    if (!listings.length) return [];
    const listingIds = listings.map(l => l.id);
    const deliveries = await this.deliveriesRepository.find({ where: { listingId: In(listingIds) } });

    // Backfill: older rows may have null pickupQrToken (sender then can't show QR).
    const toFix = deliveries
      .filter(d => d.status === 'pickup_pending' && (!d.pickupQrToken || d.pickupQrToken.trim().length === 0))
      .map(d => {
        // eslint-disable-next-line no-param-reassign
        d.pickupQrToken = this.generateQrToken();
        return d;
      });
    if (toFix.length > 0) {
      await this.deliveriesRepository.save(toFix);
    }

    return deliveries;
  }
}
