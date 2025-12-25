import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WsGateway } from '../ws/ws.gateway';
import { Delivery } from './delivery.entity';
import { Listing } from '../listings/listing.entity';
import { Offer } from '../offers/offer.entity';
import { User } from '../auth/user.entity';
import { SmsService } from '../sms/sms.service';
import { PushService } from '../push/push.service';
import * as admin from 'firebase-admin';
import { S3Service } from '../common/s3.service';

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private wsGateway: WsGateway,
    private readonly smsService: SmsService,
    private readonly pushService: PushService,
    private readonly s3Service: S3Service,
    private readonly config: ConfigService,
    @InjectRepository(Delivery)
    private readonly deliveriesRepository: Repository<Delivery>,
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
    @InjectRepository(Offer)
    private readonly offersRepository: Repository<Offer>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  private isFinalStatus(status: Delivery['status']): boolean {
    return (
      status === 'delivered' || status === 'cancelled' || status === 'disputed'
    );
  }

  private assertTransition(
    from: Delivery['status'],
    to: Delivery['status'],
  ): void {
    const allowed: Record<Delivery['status'], Array<Delivery['status']>> = {
      pickup_pending: ['in_transit', 'cancelled'],
      in_transit: ['at_door', 'delivered', 'cancelled'],
      at_door: ['delivered', 'cancelled'],
      delivered: ['disputed'],
      cancelled: [],
      disputed: [],
    };

    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`İşlem geçersiz: '${from}' durumundan '${to}' durumuna geçiş yapılamaz.`);
    }
  }

  private async notifyCriticalDeliveryEvent(params: {
    type:
      | 'delivery_cancelled'
      | 'delivery_at_door'
      | 'delivery_delivered'
      | 'delivery_disputed';
    deliveryId: string;
    listingId: string;
    ownerId?: string | null;
    carrierId?: string | null;
    title: string;
    body: string;
  }): Promise<void> {
    const recipientIds = [params.ownerId, params.carrierId].filter(
      Boolean,
    ) as string[];
    if (recipientIds.length === 0) return;
    try {
      const users = await this.usersRepository.findByIds(recipientIds);
      await Promise.all(
        users
          .map((u) => u?.fcmToken?.toString().trim())
          .filter((t): t is string => Boolean(t))
          .map((token) =>
            this.pushService.sendToToken({
              token,
              title: params.title,
              body: params.body,
              data: {
                type: params.type,
                deliveryId: params.deliveryId,
                listingId: params.listingId,
              },
            }),
          ),
      );
    } catch (_) {
      // Ignore push failures.
    }
  }

  private ensureFirebaseAdminInitialized(): void {
    if (admin.apps.length > 0) return;

    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    if (!json || !json.trim().startsWith('{')) {
      throw new BadRequestException('Sunucu yapılandırmasında eksik Firebase anahtarı. Lütfen sistem yöneticisine başvurun.');
    }
    try {
      const creds = JSON.parse(json);
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId: creds.project_id ?? projectId,
      });
    } catch (_) {
      throw new BadRequestException('Sunucu üzerinde Firebase servisi başlatılamadı. Lütfen tekrar deneyin veya yöneticinize başvurun.');
    }
  }

  private normalizePhoneForCompare(phone: string): string {
    const digits = (phone ?? '').replace(/\D/g, '');
    if (!digits) return '';
    // Compare using last 10 digits (TR local), tolerates +90 / 0 prefixes.
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

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

  private generateOtp6(): string {
    const n = Math.floor(100000 + Math.random() * 900000);
    return String(n);
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

  async pickup(
    id: string,
    carrierId: string,
    qrToken?: string,
  ): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (delivery && delivery.status === 'pickup_pending') {
      if (
        !qrToken ||
        !delivery.pickupQrToken ||
        qrToken !== delivery.pickupQrToken
      ) {
        throw new BadRequestException('QR doğrulaması gerekli');
      }
      this.assertTransition(delivery.status, 'in_transit');
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

  async markAtDoor(id: string, carrierId: string): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat kaydı bulunamadı. Lütfen geçerli bir teslimat seçtiğinizden emin olun.');
    }
    if (delivery.status !== 'in_transit') {
      throw new BadRequestException('Kapıda olarak işaretleme işlemi yalnızca teslimat yoldayken yapılabilir.');
    }
    if (delivery.carrierId && delivery.carrierId !== carrierId) {
      throw new ForbiddenException('Bu teslimatın taşıyıcısı siz değilsiniz.');
    }
    if (!delivery.carrierId) {
      throw new BadRequestException('Teslimat için atanmış bir taşıyıcı bulunamadı.');
    }

    this.assertTransition(delivery.status, 'at_door');
    delivery.status = 'at_door';
    const saved = await this.deliveriesRepository.save(delivery);
    this.wsGateway.sendDeliveryUpdate(id, saved);

    const listing = await this.listingsRepository.findOne({
      where: { id: delivery.listingId },
    });
    await this.notifyCriticalDeliveryEvent({
      type: 'delivery_at_door',
      deliveryId: saved.id,
      listingId: saved.listingId,
      ownerId: listing?.ownerId ?? null,
      carrierId: saved.carrierId ?? null,
      title: 'Kapıda',
      body: `${listing?.title ?? 'Gönderi'} için taşıyıcı adrese ulaştı.`,
    });

    return {
      ...saved,
      proofPhotos: await this.s3Service.toDisplayUrls(saved.proofPhotos ?? []),
    };
  }

  async deliver(id: string, carrierId: string): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (
      delivery &&
      (delivery.status === 'in_transit' || delivery.status === 'at_door')
    ) {
      if (delivery.carrierId && delivery.carrierId !== carrierId) {
        throw new ForbiddenException('Bu teslimatın taşıyıcısı değilsiniz');
      }
      if (!delivery.carrierId) {
        throw new BadRequestException('Teslimatın taşıyıcısı yok');
      }

      this.assertTransition(delivery.status, 'delivered');
      delivery.status = 'delivered';
      delivery.deliveredAt = new Date();
      const saved = await this.deliveriesRepository.save(delivery);

      // Update delivery stats
      await this.bumpDeliveredCount(delivery.carrierId);
      const listing = await this.listingsRepository.findOne({
        where: { id: delivery.listingId },
      });
      if (listing?.ownerId) {
        await this.bumpDeliveredCount(listing.ownerId);
      }

      this.wsGateway.sendDeliveryUpdate(id, saved);

      await this.notifyCriticalDeliveryEvent({
        type: 'delivery_delivered',
        deliveryId: saved.id,
        listingId: saved.listingId,
        ownerId: listing?.ownerId ?? null,
        carrierId: saved.carrierId ?? null,
        title: 'Teslim edildi',
        body: `${listing?.title ?? 'Gönderi'} teslim edildi.`,
      });

      return saved;
    }
    return delivery ?? null;
  }

  /**
   * Sends a delivery confirmation code (OTP) to the receiver phone.
   * NOTE: SMS integration is not wired yet; we log the code for now.
   * As requested, we currently auto-approve the delivery without receiver auth.
   */
  async sendDeliveryCode(
    id: string,
    carrierId: string,
  ): Promise<Delivery | null> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat bulunamadı');
    }
    if (delivery.status !== 'in_transit' && delivery.status !== 'at_door') {
      throw new BadRequestException(
        'Kod yalnızca yoldaki/kapıdaki teslimatlarda gönderilebilir',
      );
    }
    if (delivery.carrierId && delivery.carrierId !== carrierId) {
      throw new ForbiddenException('Bu teslimatın taşıyıcısı siz değilsiniz.');
    }
    if (!delivery.carrierId) {
      throw new BadRequestException('Teslimat için atanmış bir taşıyıcı bulunamadı.');
    }

    // Geçici istek (22.12.2025): Taşıyıcı “Kod Gönder”e basınca direkt teslim edildi yap.
    // Daha sonra gerçek OTP/SMS/receiver doğrulama akışına geri döneceğiz.
    const listing = await this.listingsRepository.findOne({
      where: { id: delivery.listingId },
    });
    this.assertTransition(delivery.status, 'delivered');
    delivery.status = 'delivered';
    delivery.deliveredAt = new Date();
    const saved = await this.deliveriesRepository.save(delivery);

    await this.bumpDeliveredCount(delivery.carrierId);
    if (listing?.ownerId) {
      await this.bumpDeliveredCount(listing.ownerId);
    }

    this.wsGateway.sendDeliveryUpdate(id, saved);

    await this.notifyCriticalDeliveryEvent({
      type: 'delivery_delivered',
      deliveryId: saved.id,
      listingId: saved.listingId,
      ownerId: listing?.ownerId ?? null,
      carrierId: saved.carrierId ?? null,
      title: 'Teslim edildi',
      body: `${listing?.title ?? 'Gönderi'} teslim edildi.`,
    });

    return saved;
  }

  async confirmDeliveryWithFirebaseToken(
    id: string,
    carrierId: string,
    idToken: string,
  ): Promise<Delivery | null> {
    const token = (idToken ?? '').trim();
    if (!token) {
      throw new BadRequestException('idToken gerekli');
    }

    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat bulunamadı');
    }
    if (delivery.status !== 'in_transit' && delivery.status !== 'at_door') {
      throw new BadRequestException('Teslimat yolda/kapıda değil');
    }
    if (delivery.carrierId && delivery.carrierId !== carrierId) {
      throw new ForbiddenException('Bu teslimatın taşıyıcısı değilsiniz');
    }
    if (!delivery.carrierId) {
      throw new BadRequestException('Teslimatın taşıyıcısı yok');
    }

    const listing = await this.listingsRepository.findOne({
      where: { id: delivery.listingId },
    });
    const expectedPhone = this.normalizePhoneForCompare(
      listing?.receiver_phone?.toString() ?? '',
    );
    if (!expectedPhone) {
      throw new BadRequestException('Alıcı telefon numarası girilmemiş');
    }

    this.ensureFirebaseAdminInitialized();
    const decoded = await admin.auth().verifyIdToken(token);
    const tokenPhone = this.normalizePhoneForCompare(
      (decoded as any)?.phone_number ?? '',
    );
    if (!tokenPhone) {
      throw new BadRequestException('Firebase token içinde phone_number yok');
    }
    if (tokenPhone !== expectedPhone) {
      throw new ForbiddenException('Alıcı telefonu doğrulanamadı');
    }

    this.assertTransition(delivery.status, 'delivered');
    delivery.status = 'delivered';
    delivery.deliveredAt = new Date();
    const saved = await this.deliveriesRepository.save(delivery);

    await this.bumpDeliveredCount(delivery.carrierId);
    if (listing?.ownerId) {
      await this.bumpDeliveredCount(listing.ownerId);
    }

    this.wsGateway.sendDeliveryUpdate(id, saved);

    await this.notifyCriticalDeliveryEvent({
      type: 'delivery_delivered',
      deliveryId: saved.id,
      listingId: saved.listingId,
      ownerId: listing?.ownerId ?? null,
      carrierId: saved.carrierId ?? null,
      title: 'Teslim',
      body: 'Teslimat tamamlandı.',
    });

    return saved;
  }

  async cancel(
    id: string,
    actor: { id: string; role: 'sender' | 'carrier' },
  ): Promise<Delivery> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat bulunamadı');
    }
    if (this.isFinalStatus(delivery.status)) {
      throw new BadRequestException('Final durumdaki teslimat iptal edilemez');
    }

    const listing = await this.listingsRepository.findOne({
      where: { id: delivery.listingId },
    });
    if (!listing) {
      throw new BadRequestException('Listing bulunamadı');
    }

    if (actor.role === 'carrier') {
      if (delivery.carrierId && delivery.carrierId !== actor.id) {
        throw new ForbiddenException('Bu teslimatın taşıyıcısı değilsiniz');
      }
      if (!delivery.carrierId) {
        throw new BadRequestException('Teslimatın taşıyıcısı yok');
      }
    } else {
      if (listing.ownerId !== actor.id) {
        throw new ForbiddenException('Bu teslimatın göndericisi değilsiniz');
      }
    }

    this.assertTransition(delivery.status, 'cancelled');
    delivery.status = 'cancelled';
    const saved = await this.deliveriesRepository.save(delivery);
    this.wsGateway.sendDeliveryUpdate(id, saved);

    await this.notifyCriticalDeliveryEvent({
      type: 'delivery_cancelled',
      deliveryId: saved.id,
      listingId: saved.listingId,
      ownerId: listing.ownerId,
      carrierId: saved.carrierId ?? null,
      title: 'İptal',
      body: 'Teslimat iptal edildi.',
    });

    return saved;
  }

  async dispute(
    id: string,
    actor: { id: string; role: 'sender' | 'carrier' },
    reason?: string | null,
  ): Promise<Delivery> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat bulunamadı');
    }
    if (delivery.status !== 'delivered') {
      throw new BadRequestException(
        'Uyuşmazlık yalnızca teslim edilmiş teslimatlarda açılabilir',
      );
    }

    const listing = await this.listingsRepository.findOne({
      where: { id: delivery.listingId },
    });
    if (!listing) {
      throw new BadRequestException('Listing bulunamadı');
    }

    if (actor.role === 'carrier') {
      if (!delivery.carrierId || delivery.carrierId !== actor.id) {
        throw new ForbiddenException('Bu teslimatın taşıyıcısı değilsiniz');
      }
    } else {
      if (listing.ownerId !== actor.id) {
        throw new ForbiddenException('Bu teslimatın göndericisi değilsiniz');
      }
    }

    this.assertTransition(delivery.status, 'disputed');
    delivery.status = 'disputed';
    if (reason != null) {
      const trimmed = String(reason).trim();
      delivery.disputeReason = trimmed.length ? trimmed : null;
    }
    delivery.disputedAt = new Date();
    const saved = await this.deliveriesRepository.save(delivery);
    this.wsGateway.sendDeliveryUpdate(id, saved);

    await this.notifyCriticalDeliveryEvent({
      type: 'delivery_disputed',
      deliveryId: saved.id,
      listingId: saved.listingId,
      ownerId: listing.ownerId,
      carrierId: saved.carrierId ?? null,
      title: 'Uyuşmazlık',
      body: 'Teslimat için uyuşmazlık başlatıldı.',
    });

    return saved;
  }

  async addProofPhoto(
    id: string,
    carrierId: string,
    photoKey?: string,
  ): Promise<any> {
    const key = (photoKey ?? '').trim();
    if (!key) {
      throw new BadRequestException('photoKey gerekli');
    }

    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat bulunamadı');
    }
    if (delivery.carrierId && delivery.carrierId !== carrierId) {
      throw new ForbiddenException('Bu teslimatın taşıyıcısı siz değilsiniz');
    }
    if (!delivery.carrierId) {
      // Allow attaching proof only after pickup assigned a carrier.
      throw new BadRequestException('Teslimat için atanmış bir taşıyıcı bulunamadı');
    }
    if (delivery.status === 'cancelled') {
      throw new BadRequestException('İptal edilmiş teslimata kanıt eklenemez');
    }

    const next = Array.isArray(delivery.proofPhotos) ? [...delivery.proofPhotos] : [];
    if (!next.includes(key)) next.push(key);
    delivery.proofPhotos = next;

    const saved = await this.deliveriesRepository.save(delivery);
    this.wsGateway.sendDeliveryUpdate(id, saved);
    return {
      ...saved,
      proofPhotos: await this.s3Service.toDisplayUrls(saved.proofPhotos ?? []),
    };
  }

  async updateLocation(
    id: string,
    carrierId: string,
    lat: number,
    lng: number,
  ): Promise<Delivery> {
    const delivery = await this.deliveriesRepository.findOne({ where: { id } });
    if (!delivery) {
      throw new BadRequestException('Teslimat bulunamadı');
    }
    if (delivery.carrierId && delivery.carrierId !== carrierId) {
      throw new ForbiddenException('Bu teslimatın taşıyıcısı değilsiniz');
    }
    if (delivery.status !== 'in_transit' && delivery.status !== 'at_door') {
      throw new BadRequestException(
        'Konum güncelleme yalnızca yolda/kapıdayken yapılabilir',
      );
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

  async findOne(id: string): Promise<any | null> {
    const d = await this.deliveriesRepository.findOne({ where: { id } });
    if (!d) return null;
    return {
      ...d,
      proofPhotos: await this.s3Service.toDisplayUrls(d.proofPhotos ?? []),
    };
  }

  async findByListing(listingId: string): Promise<any | null> {
    const d = await this.deliveriesRepository.findOne({ where: { listingId } });
    if (!d) return null;
    return {
      ...d,
      proofPhotos: await this.s3Service.toDisplayUrls(d.proofPhotos ?? []),
    };
  }

  async findByCarrier(carrierId: string): Promise<any[]> {
    const deliveries = await this.deliveriesRepository.find({
      where: { carrierId },
    });
    const toFix = deliveries
      .filter(
        (d) =>
          d.status === 'pickup_pending' &&
          (!d.pickupQrToken || d.pickupQrToken.trim().length === 0),
      )
      .map((d) => {
        d.pickupQrToken = this.generateQrToken();
        return d;
      });
    if (toFix.length > 0) {
      await this.deliveriesRepository.save(toFix);
    }

    const listingIds = [
      ...new Set(deliveries.map((d) => d.listingId).filter(Boolean)),
    ];
    const listings = listingIds.length
      ? await this.listingsRepository.find({ where: { id: In(listingIds) } })
      : [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const signedPhotosByListingId = new Map<string, string[]>();
    await Promise.all(
      listings.map(async (l) => {
        signedPhotosByListingId.set(
          l.id,
          await this.s3Service.toDisplayUrls(l.photos),
        );
      }),
    );

    return Promise.all(
      deliveries.map(async (d) => {
        const listing = listingMap.get(d.listingId);
        return {
          ...d,
          proofPhotos: await this.s3Service.toDisplayUrls(d.proofPhotos ?? []),
          listing: listing
            ? {
                id: listing.id,
                title: listing.title,
                description: listing.description,
                photos:
                  signedPhotosByListingId.get(listing.id) ?? listing.photos,
                weight: listing.weight,
                dimensions: listing.dimensions,
                fragile: listing.fragile,
                pickup_location: listing.pickup_location,
                dropoff_location: listing.dropoff_location,
                receiver_phone: listing.receiver_phone ?? null,
                ownerId: listing.ownerId,
                createdAt: listing.createdAt,
                updatedAt: listing.updatedAt,
              }
            : null,
          receiver_phone: listing?.receiver_phone ?? null,
        };
      }),
    );
  }

  async findByOwner(ownerId: string): Promise<any[]> {
    const listings = await this.listingsRepository.find({ where: { ownerId } });
    if (!listings.length) return [];
    const listingIds = listings.map((l) => l.id);
    const deliveries = await this.deliveriesRepository.find({
      where: { listingId: In(listingIds) },
    });

    // Backfill: older rows may have null pickupQrToken (sender then can't show QR).
    const toFix = deliveries
      .filter(
        (d) =>
          d.status === 'pickup_pending' &&
          (!d.pickupQrToken || d.pickupQrToken.trim().length === 0),
      )
      .map((d) => {
        d.pickupQrToken = this.generateQrToken();
        return d;
      });
    if (toFix.length > 0) {
      await this.deliveriesRepository.save(toFix);
    }

    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const signedPhotosByListingId = new Map<string, string[]>();
    await Promise.all(
      listings.map(async (l) => {
        signedPhotosByListingId.set(
          l.id,
          await this.s3Service.toDisplayUrls(l.photos),
        );
      }),
    );

    const carrierIds = [
      ...new Set(deliveries.map((d) => d.carrierId).filter(Boolean)),
    ] as string[];
    const carriers = carrierIds.length
      ? await this.usersRepository.findByIds(carrierIds)
      : [];
    const carrierMap = new Map(carriers.map((c) => [c.id, c]));

    const signedCarrierAvatar = new Map<string, string | null>();
    await Promise.all(
      carriers.map(async (c) => {
        signedCarrierAvatar.set(
          c.id,
          c.avatarUrl ? await this.s3Service.toDisplayUrl(c.avatarUrl) : null,
        );
      }),
    );

    const acceptedOffers = listingIds.length
      ? await this.offersRepository.find({
          where: { listingId: In(listingIds), status: 'accepted' },
        })
      : [];
    const acceptedOfferMap = new Map(
      acceptedOffers.map((o) => [o.listingId, o]),
    );

    return Promise.all(
      deliveries.map(async (d) => {
        const listing = listingMap.get(d.listingId);
        const carrier = d.carrierId ? carrierMap.get(d.carrierId) : null;
        const acceptedOffer = acceptedOfferMap.get(d.listingId);
        return {
          ...d,
          proofPhotos: await this.s3Service.toDisplayUrls(d.proofPhotos ?? []),
          listing: listing
            ? {
                id: listing.id,
                title: listing.title,
                description: listing.description,
                photos:
                  signedPhotosByListingId.get(listing.id) ?? listing.photos,
                weight: listing.weight,
                dimensions: listing.dimensions,
                fragile: listing.fragile,
                pickup_location: listing.pickup_location,
                dropoff_location: listing.dropoff_location,
                receiver_phone: listing.receiver_phone ?? null,
                ownerId: listing.ownerId,
                createdAt: listing.createdAt,
                updatedAt: listing.updatedAt,
              }
            : null,
          receiver_phone: listing?.receiver_phone ?? null,
          carrier: carrier
            ? {
                id: carrier.id,
                fullName: carrier.fullName ?? null,
                email: carrier.email ?? null,
                avatarUrl: signedCarrierAvatar.get(carrier.id) ?? null,
                rating: carrier.rating ?? null,
                deliveredCount: carrier.deliveredCount ?? null,
              }
            : null,
          acceptedOffer: acceptedOffer
            ? {
                id: acceptedOffer.id,
                amount: acceptedOffer.amount,
                proposerId: acceptedOffer.proposerId,
              }
            : null,
        };
      }),
    );
  }
}
