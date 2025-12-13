import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WsGateway } from '../ws/ws.gateway';
import { Offer, OfferStatus } from './offer.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Listing } from '../listings/listing.entity';

@Injectable()
export class OffersService {
  constructor(
    private wsGateway: WsGateway,
    @InjectRepository(Offer)
    private readonly offersRepository: Repository<Offer>,
    @InjectRepository(Delivery)
    private readonly deliveriesRepository: Repository<Delivery>,
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
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
    this.wsGateway.sendOfferNotification(dto.listingId, saved);
    return saved;
  }

  // Teklifleri listele
  async findByListing(listingId: string): Promise<Offer[]> {
    return this.offersRepository.find({ where: { listingId } });
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
        delivery = this.deliveriesRepository.create({
          listingId: accepted.listingId,
          carrierId: accepted.proposerId,
          status: 'pickup_pending',
        });
        await this.deliveriesRepository.save(delivery);
      }
    }

    return accepted;
  }
}
