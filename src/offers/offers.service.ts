import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WsGateway } from '../ws/ws.gateway';
import { Offer, OfferStatus } from './offer.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Listing } from '../listings/listing.entity';
import { Message } from '../messages/message.entity';
import { User } from '../auth/user.entity';
import { PushService } from '../push/push.service';

@Injectable()
export class OffersService {
  constructor(
    private wsGateway: WsGateway,
    private readonly pushService: PushService,
    @InjectRepository(Offer)
    private readonly offersRepository: Repository<Offer>,
    @InjectRepository(Delivery)
    private readonly deliveriesRepository: Repository<Delivery>,
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Teklif oluştur
  async create(dto: {
    listingId: string;
    proposerId: string;
    amount: number;
    message?: string;
  }): Promise<Offer> {
    // Kendi listingine teklif verememeli
    const listing = await this.listingsRepository.findOne({ where: { id: dto.listingId } });
    if (!listing) {
      throw new BadRequestException('Listing bulunamadı');
    }
    if (listing.ownerId === dto.proposerId) {
      throw new BadRequestException('Kendi ilanınıza teklif veremezsiniz');
    }

    const offer = this.offersRepository.create({
      ...dto,
      status: 'pending' as OfferStatus,
    });
    const saved = await this.offersRepository.save(offer);

    // Otomatik mesaj oluştur ve real-time gönder
    const message = this.messagesRepository.create({
      listingId: dto.listingId,
      senderId: listing.ownerId,
      carrierId: dto.proposerId,
      content: `Taşıyıcı teklif verdi: ${dto.amount} TL`,
      fromCarrier: true,
    });
    const savedMessage = await this.messagesRepository.save(message);
    this.wsGateway.sendMessage(dto.listingId, savedMessage);
    this.wsGateway.sendOfferNotification(dto.listingId, saved);

    // Push notification to sender (listing owner)
    try {
      const owner = await this.usersRepository.findOne({ where: { id: listing.ownerId } });
      const token = owner?.fcmToken;
      if (token) {
        await this.pushService.sendToToken({
          token,
          title: 'Yeni Teklif',
          body: `"${listing.title ?? 'Kargo'}" için ${dto.amount} TL teklif geldi.`,
          data: {
            type: 'offer',
            listingId: dto.listingId,
            offerId: saved.id,
          },
        });
      }
    } catch (_) {
      // Ignore push failures.
    }

    return saved;
  }

  // Teklifleri listele
  async findByListing(listingId: string): Promise<any[]> {
    const offers = await this.offersRepository.find({ where: { listingId } });
    if (!offers.length) return [];
    const proposerIds = [...new Set(offers.map(o => o.proposerId))];
    const users = await this.usersRepository.findByIds(proposerIds);
    const userMap = new Map(users.map(u => [u.id, u]));

    return offers.map(o => {
      const user = userMap.get(o.proposerId);
      return {
        ...o,
        proposerName: user?.fullName ?? user?.email ?? 'Taşıyıcı',
        proposerAvatar: user?.avatarUrl ?? null,
        proposerRating: user?.rating ?? null,
        proposerDelivered: user?.deliveredCount ?? null,
      };
    });
  }

  // Owner'a ait tüm listinglerdeki teklifler
  async findByOwner(ownerId: string): Promise<any[]> {
    const listings = await this.listingsRepository.find({ where: { ownerId } });
    if (!listings.length) return [];
    const listingIds = listings.map(l => l.id);
    const offers = await this.offersRepository.find({
      where: { listingId: In(listingIds) },
      order: { createdAt: 'DESC' },
    });
    if (!offers.length) return [];
    const proposerIds = [...new Set(offers.map(o => o.proposerId))];
    const users = await this.usersRepository.findByIds(proposerIds);
    const userMap = new Map(users.map(u => [u.id, u]));

    return offers.map(o => {
      const user = userMap.get(o.proposerId);
      return {
        ...o,
        proposerName: user?.fullName ?? user?.email ?? 'Taşıyıcı',
        proposerAvatar: user?.avatarUrl ?? null,
        proposerRating: user?.rating ?? null,
        proposerDelivered: user?.deliveredCount ?? null,
      };
    });
  }

  // Teklifi reddet
  async rejectOffer(id: string): Promise<Offer | null> {
    const offer = await this.offersRepository.findOne({ where: { id } });
    if (!offer) return null;
    offer.status = 'rejected';
    return this.offersRepository.save(offer);
  }

  // Teklifi kabul et
  async acceptOffer(id: string): Promise<Offer | null> {
    const offer = await this.offersRepository.findOne({ where: { id } });
    if (!offer) return null;

    // Aynı listing için daha önce kabul edilmiş teklif varsa hepsini reddet
    const offersForListing = await this.offersRepository.find({
      where: { listingId: offer.listingId },
    });

    const updatedOffers = offersForListing.map(o => {
      // eslint-disable-next-line no-param-reassign
      o.status = o.id === id ? 'accepted' : 'rejected';
      return o;
    });

    await this.offersRepository.save(updatedOffers);

    const accepted = await this.offersRepository.findOne({ where: { id } });

    // Kabul edilen tekliften bir delivery kaydı oluştur
    if (accepted) {
      let delivery = await this.deliveriesRepository.findOne({
        where: { listingId: accepted.listingId },
      });

      if (!delivery) {
        const rnd = () => Math.random().toString(36).slice(2);
        const pickupQrToken = `${rnd()}${rnd()}`.slice(0, 24);
        delivery = this.deliveriesRepository.create({
          listingId: accepted.listingId,
          carrierId: accepted.proposerId,
          status: 'pickup_pending',
          pickupQrToken,
          trackingEnabled: false,
        });
        await this.deliveriesRepository.save(delivery);
      }
    }

    return accepted;
  }
}
