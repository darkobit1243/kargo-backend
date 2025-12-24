import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WsGateway } from '../ws/ws.gateway';
import { Offer, OfferStatus } from './offer.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Listing } from '../listings/listing.entity';
import { Message } from '../messages/message.entity';
import { User } from '../auth/user.entity';
import { PushService } from '../push/push.service';
import { S3Service } from '../common/s3.service';

@Injectable()
export class OffersService {
  constructor(
    private wsGateway: WsGateway,
    private readonly pushService: PushService,
    private readonly s3Service: S3Service,
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
    const listing = await this.listingsRepository.findOne({
      where: { id: dto.listingId },
    });
    if (!listing) {
      throw new BadRequestException('İlan bulunamadı. Lütfen geçerli bir ilan seçtiğinizden emin olun.');
    }
    if (listing.ownerId === dto.proposerId) {
      throw new BadRequestException('Kendi oluşturduğunuz ilana teklif veremezsiniz.');
    }

    // If listing already has an accepted offer, it is no longer offerable.
    const alreadyAccepted = await this.offersRepository.findOne({
      where: { listingId: dto.listingId, status: 'accepted' },
    });
    if (alreadyAccepted) {
      throw new BadRequestException('Bu ilan için zaten kabul edilmiş bir teklif mevcut.');
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

    // Critical push: new offer -> notify listing owner (sender)
    try {
      const owner = await this.usersRepository.findOne({
        where: { id: listing.ownerId },
      });
      const token = owner?.fcmToken?.toString().trim();
      if (token) {
        const proposer = await this.usersRepository.findOne({
          where: { id: dto.proposerId },
        });
        const proposerName =
          proposer?.fullName ?? proposer?.email ?? 'Taşıyıcı';
        await this.pushService.sendToToken({
          token,
          title: 'Yeni teklif geldi',
          body: `${proposerName} "${listing.title ?? 'Gönderi'}" için ${dto.amount} TL teklif verdi.`,
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

  private async assertListingOwnedBy(
    listingId: string,
    ownerId: string,
  ): Promise<void> {
    const listing = await this.listingsRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) {
      throw new BadRequestException('İlan bulunamadı. Lütfen geçerli bir ilan seçtiğinizden emin olun.');
    }
    if (listing.ownerId !== ownerId) {
      throw new ForbiddenException('Bu kayıtlara erişim yetkiniz yok. Sadece kendi ilanlarınıza ait teklifleri görüntüleyebilirsiniz.');
    }
  }

  private async enrichOffers(offers: Offer[]): Promise<any[]> {
    if (!offers.length) return [];

    const proposerIds = [...new Set(offers.map((o) => o.proposerId))];
    const users = proposerIds.length
      ? await this.usersRepository.find({ where: { id: In(proposerIds) } })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const signedAvatar = new Map<string, string | null>();
    await Promise.all(
      users.map(async (u) => {
        signedAvatar.set(
          u.id,
          u.avatarUrl ? await this.s3Service.toDisplayUrl(u.avatarUrl) : null,
        );
      }),
    );

    return offers.map((o) => {
      const user = userMap.get(o.proposerId);
      const avatarKey = user?.avatarUrl ?? null;
      return {
        ...o,
        proposerName: user?.fullName ?? user?.email ?? 'Taşıyıcı',
        proposerAvatar: signedAvatar.get(o.proposerId) ?? null,
        proposerAvatarKey: avatarKey,
        proposerRating: user?.rating ?? null,
        proposerDelivered: user?.deliveredCount ?? null,
      };
    });
  }

  // Teklifleri listele
  async findByListing(listingId: string): Promise<any[]> {
    const offers = await this.offersRepository.find({
      where: { listingId },
      order: { createdAt: 'DESC' },
    });
    return this.enrichOffers(offers);
  }

  async findByListingPaged(
    listingId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: any[]; meta: any }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));

    const [offers, total] = await this.offersRepository.findAndCount({
      where: { listingId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    const data = await this.enrichOffers(offers);
    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        lastPage: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  // Sadece listing sahibi (sender) için listing teklifler
  async findByListingForOwner(
    listingId: string,
    ownerId: string,
  ): Promise<any[]> {
    await this.assertListingOwnedBy(listingId, ownerId);
    return this.findByListing(listingId);
  }

  async findByListingForOwnerPaged(
    listingId: string,
    ownerId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: any[]; meta: any }> {
    await this.assertListingOwnedBy(listingId, ownerId);
    return this.findByListingPaged(listingId, page, limit);
  }

  // Owner'a ait tüm listinglerdeki teklifler
  async findByOwner(ownerId: string): Promise<any[]> {
    const listings = await this.listingsRepository.find({ where: { ownerId } });
    if (!listings.length) return [];
    const listingIds = listings.map((l) => l.id);
    const offers = await this.offersRepository.find({
      where: { listingId: In(listingIds) },
      order: { createdAt: 'DESC' },
    });
    return this.enrichOffers(offers);
  }

  async findByOwnerPaged(
    ownerId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: any[]; meta: any }> {
    const listings = await this.listingsRepository.find({ where: { ownerId } });
    if (!listings.length) {
      return {
        data: [],
        meta: { total: 0, page: Math.max(1, page), limit: Math.min(50, Math.max(1, limit)), lastPage: 1 },
      };
    }
    const listingIds = listings.map((l) => l.id);

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));

    const [offers, total] = await this.offersRepository.findAndCount({
      where: { listingId: In(listingIds) },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    const data = await this.enrichOffers(offers);
    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        lastPage: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  // Teklifi reddet
  async rejectOffer(id: string, ownerId: string): Promise<Offer | null> {
    const offer = await this.offersRepository.findOne({ where: { id } });
    if (!offer) return null;

    await this.assertListingOwnedBy(offer.listingId, ownerId);

    offer.status = 'rejected';
    return this.offersRepository.save(offer);
  }

  // Teklifi kabul et
  async acceptOffer(id: string, ownerId: string): Promise<Offer | null> {
    const offer = await this.offersRepository.findOne({ where: { id } });
    if (!offer) return null;

    await this.assertListingOwnedBy(offer.listingId, ownerId);

    // If there is already an accepted offer for this listing, only allow re-accepting the same one.
    const existingAccepted = await this.offersRepository.findOne({
      where: { listingId: offer.listingId, status: 'accepted' },
    });
    if (existingAccepted && existingAccepted.id !== id) {
      throw new BadRequestException('Bu ilan için zaten başka bir teklif kabul edilmiş.');
    }

    // Aynı listing için daha önce kabul edilmiş teklif varsa hepsini reddet
    const offersForListing = await this.offersRepository.find({
      where: { listingId: offer.listingId },
    });

    const updatedOffers = offersForListing.map((o) => {
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

      // NOTE: DB'de daha önce oluşmuş delivery varsa (özellikle eski sürüm/kolon null),
      // pickupQrToken boş kalabiliyor ve gönderici QR göremiyor.
      // Bu yüzden delivery var olsa bile pickup_pending aşamasında token'ı garanti et.
      const rnd = () => Math.random().toString(36).slice(2);
      const generateToken = () => `${rnd()}${rnd()}`.slice(0, 24);

      if (!delivery) {
        delivery = this.deliveriesRepository.create({
          listingId: accepted.listingId,
          carrierId: accepted.proposerId,
          status: 'pickup_pending',
          pickupQrToken: generateToken(),
          trackingEnabled: false,
        });
        await this.deliveriesRepository.save(delivery);
      } else if (delivery.status === 'pickup_pending') {
        // Ensure correct carrier + token while waiting for pickup.
        delivery.carrierId = accepted.proposerId;
        if (!delivery.pickupQrToken) {
          delivery.pickupQrToken = generateToken();
        }
        delivery.trackingEnabled = false;
        await this.deliveriesRepository.save(delivery);
      }

      // Critical push: offer accepted -> notify carrier.
      try {
        const listing = await this.listingsRepository.findOne({
          where: { id: accepted.listingId },
        });
        const carrier = await this.usersRepository.findOne({
          where: { id: accepted.proposerId },
        });
        const token = carrier?.fcmToken?.toString().trim();
        if (token) {
          await this.pushService.sendToToken({
            token,
            title: 'Teklif Kabul Edildi',
            body: `"${listing?.title ?? 'Gönderi'}" için teklifin kabul edildi.`,
            data: {
              type: 'offer_accepted',
              listingId: accepted.listingId,
              offerId: accepted.id,
            },
          });
        }
      } catch (_) {
        // Ignore push failures.
      }
    }

    return accepted;
  }
}
