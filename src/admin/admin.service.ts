import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAuditLog } from './admin-audit-log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../auth/user.entity';
import { Listing } from '../listings/listing.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { S3Service } from '../common/s3.service';
import { PushService } from '../push/push.service';

type AuditMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
    @InjectRepository(Delivery)
    private readonly deliveriesRepository: Repository<Delivery>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogRepository: Repository<AdminAuditLog>,
    private readonly s3Service: S3Service,
    private readonly pushService: PushService,
  ) {}

  private async withSignedAvatar<T extends { avatarUrl?: string | null }>(
    user: T,
  ): Promise<T> {
    const current = user.avatarUrl;
    if (!current) return user;
    const signed = await this.s3Service.toDisplayUrl(current);
    return {
      ...user,
      avatarUrl: signed,
    };
  }

  private createSignedUrlHelpers() {
    const memo = new Map<string, Promise<string>>();

    const toDisplayUrl = (value: string): Promise<string> => {
      const key = value?.toString().trim();
      if (!key) return Promise.resolve(value);
      const existing = memo.get(key);
      if (existing) return existing;
      const p = this.s3Service.toDisplayUrl(key);
      memo.set(key, p);
      return p;
    };

    const toDisplayUrlMaybe = async (value?: string | null): Promise<string | null> => {
      if (!value) return null;
      return toDisplayUrl(value);
    };

    const toDisplayUrls = (values: string[]): Promise<string[]> => {
      return Promise.all((values ?? []).map((v) => toDisplayUrl(v)));
    };

    return { toDisplayUrl, toDisplayUrlMaybe, toDisplayUrls };
  }

  private async writeAuditLog(params: {
    adminId: string;
    action: string;
    details?: Record<string, unknown>;
    meta?: AuditMeta;
    target?: { type: string; id: string };
  }) {
    await this.auditLogRepository.save({
      adminId: params.adminId,
      action: params.action,
      details: params.details,
      ip: params.meta?.ip ?? null,
      userAgent: params.meta?.userAgent ?? null,
      targetType: params.target?.type ?? null,
      targetId: params.target?.id ?? null,
    });
  }

  async getStats() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      totalCarriers,
      totalSenders,
      pendingVerifications,
      totalListings,
      activeListings,
      hiddenListings,
      totalDeliveries,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.usersRepository.count({ where: { role: 'carrier' } }),
      this.usersRepository.count({ where: { role: 'sender' } }),
      this.usersRepository.count({ where: { role: 'carrier', isVerified: false } }),
      this.listingsRepository.count(),
      this.listingsRepository.count({ where: { isActive: true } }),
      this.listingsRepository.count({ where: { isActive: false } }),
      this.deliveriesRepository.count(),
    ]);

    const deliveryStatusRows = await this.deliveriesRepository
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('d.status')
      .getRawMany<{ status: Delivery['status']; count: string }>();

    const deliveriesByStatus = Object.fromEntries(
      deliveryStatusRows.map((r) => [r.status, Number(r.count)]),
    );

    const [newUsersLast7Days, newListingsLast7Days, newDeliveriesLast7Days] =
      await Promise.all([
        this.usersRepository.count({ where: { createdAt: MoreThanOrEqual(since) } }),
        this.listingsRepository.count({ where: { createdAt: MoreThanOrEqual(since) } }),
        this.deliveriesRepository.count({ where: { createdAt: MoreThanOrEqual(since) } }),
      ]);

    return {
      users: {
        total: totalUsers,
        carriers: totalCarriers,
        senders: totalSenders,
        pending: pendingVerifications,
      },
      listings: { total: totalListings, active: activeListings, hidden: hiddenListings },
      deliveries: { total: totalDeliveries, byStatus: deliveriesByStatus },
      trends: {
        last7Days: {
          users: newUsersLast7Days,
          listings: newListingsLast7Days,
          deliveries: newDeliveriesLast7Days,
        },
      },
    };
  }

  async getUsers(
    role?: string,
    status?: string,
    search?: string,
    page = 1,
    limit = 20,
  ) {
    const qb = this.usersRepository.createQueryBuilder('user');

    if (role && ['sender', 'carrier', 'admin'].includes(role)) {
      qb.andWhere('user.role = :role', { role });
    }

    if (status) {
      if (status === 'pending') {
        qb.andWhere('user.isVerified = false').andWhere(
          'user.role = :carrierRole',
          { carrierRole: 'carrier' },
        );
      } else if (status === 'verified') {
        qb.andWhere('user.isVerified = true');
      } else if (status === 'banned') {
        qb.andWhere('user.isActive = false');
      } else if (status === 'active') {
        qb.andWhere('user.isActive = true');
      }
    }

    if (search) {
      qb.andWhere(
        '(user.email ILIKE :search OR user.fullName ILIKE :search OR user.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.skip((page - 1) * limit).take(limit);
    qb.orderBy('user.createdAt', 'DESC');

    const [users, total] = await qb.getManyAndCount();

    const data = await Promise.all(users.map((u) => this.withSignedAvatar(u)));

    return {
      data,
      meta: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async getListings(params: {
    status?: 'active' | 'hidden';
    ownerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const safeLimit = Math.max(1, Math.min(100, params.limit ?? 20));
    const safePage = Math.max(1, params.page ?? 1);

    const qb = this.listingsRepository.createQueryBuilder('l');

    if (params.status === 'active') qb.andWhere('l.isActive = true');
    if (params.status === 'hidden') qb.andWhere('l.isActive = false');

    if (params.ownerId) {
      qb.andWhere('l.ownerId = :ownerId', { ownerId: params.ownerId });
    }

    if (params.search) {
      qb.andWhere('(l.title ILIKE :search OR l.description ILIKE :search)', {
        search: `%${params.search}%`,
      });
    }

    qb.orderBy('l.createdAt', 'DESC');
    qb.skip((safePage - 1) * safeLimit).take(safeLimit);

    const [listings, total] = await qb.getManyAndCount();

    const signed = this.createSignedUrlHelpers();

    const ownerIds = [...new Set(listings.map((l) => l.ownerId).filter(Boolean))];
    const owners = ownerIds.length
      ? await this.usersRepository.findByIds(ownerIds)
      : [];
    const ownerMap = new Map(owners.map((u) => [u.id, u]));
    const signedOwnerAvatar = new Map<string, string | null>();
    await Promise.all(
      owners.map(async (u) => {
        signedOwnerAvatar.set(
          u.id,
          await signed.toDisplayUrlMaybe(u.avatarUrl),
        );
      }),
    );

    const data = await Promise.all(
      listings.map(async (l) => {
        const owner = ownerMap.get(l.ownerId);
        return {
          ...l,
          photos: await signed.toDisplayUrls(l.photos ?? []),
          ownerName: owner?.fullName ?? owner?.email ?? null,
          ownerEmail: owner?.email ?? null,
          ownerAvatar: owner ? (signedOwnerAvatar.get(owner.id) ?? null) : null,
        };
      }),
    );

    return {
      data,
      meta: {
        total,
        page: safePage,
        lastPage: Math.ceil(total / safeLimit),
      },
    };
  }

  async getDeliveries(params: {
    status?: Delivery['status'];
    listingId?: string;
    ownerId?: string;
    carrierId?: string;
    page?: number;
    limit?: number;
  }) {
    const safeLimit = Math.max(1, Math.min(100, params.limit ?? 20));
    const safePage = Math.max(1, params.page ?? 1);

    const qb = this.deliveriesRepository.createQueryBuilder('d');
    qb.leftJoin(Listing, 'l', 'l.id = d.listingId');

    if (params.status) {
      qb.andWhere('d.status = :status', { status: params.status });
    }
    if (params.listingId) {
      qb.andWhere('d.listingId = :listingId', { listingId: params.listingId });
    }
    if (params.carrierId) {
      qb.andWhere('d.carrierId = :carrierId', { carrierId: params.carrierId });
    }
    if (params.ownerId) {
      qb.andWhere('l.ownerId = :ownerId', { ownerId: params.ownerId });
    }

    qb.addSelect(['l.id', 'l.title', 'l.ownerId', 'l.isActive']);
    qb.orderBy('d.createdAt', 'DESC');
    qb.skip((safePage - 1) * safeLimit).take(safeLimit);

    const [deliveries, total] = await qb.getManyAndCount();

    const signed = this.createSignedUrlHelpers();

    const listingIds = [...new Set(deliveries.map((d) => d.listingId).filter(Boolean))];
    const listings = listingIds.length
      ? await this.listingsRepository.findByIds(listingIds)
      : [];
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const ownerIds = [...new Set(listings.map((l) => l.ownerId).filter(Boolean))];
    const carrierIds = [...new Set(deliveries.map((d) => d.carrierId).filter(Boolean) as string[])];
    const userIds = [...new Set([...ownerIds, ...carrierIds])];
    const users = userIds.length
      ? await this.usersRepository.findByIds(userIds)
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const signedAvatar = new Map<string, string | null>();
    await Promise.all(
      users.map(async (u) => {
        signedAvatar.set(
          u.id,
          await signed.toDisplayUrlMaybe(u.avatarUrl),
        );
      }),
    );

    const data = await Promise.all(
      deliveries.map(async (d) => {
        const listing = listingMap.get(d.listingId);
        const owner = listing?.ownerId ? userMap.get(listing.ownerId) : undefined;
        const carrier = d.carrierId ? userMap.get(d.carrierId) : undefined;
        return {
          ...d,
          proofPhotos: await signed.toDisplayUrls(d.proofPhotos ?? []),
          listing: listing
            ? {
                id: listing.id,
                title: listing.title,
                ownerId: listing.ownerId,
                isActive: listing.isActive,
              }
            : null,
          owner: owner
            ? {
                id: owner.id,
                email: owner.email,
                fullName: owner.fullName ?? null,
                avatarUrl: signedAvatar.get(owner.id) ?? null,
              }
            : null,
          carrier: carrier
            ? {
                id: carrier.id,
                email: carrier.email,
                fullName: carrier.fullName ?? null,
                avatarUrl: signedAvatar.get(carrier.id) ?? null,
              }
            : null,
        };
      }),
    );

    return {
      data,
      meta: {
        total,
        page: safePage,
        lastPage: Math.ceil(total / safeLimit),
      },
    };
  }

  async getAuditLogs(
    action?: string,
    adminId?: string,
    targetType?: string,
    targetId?: string,
    page = 1,
    limit = 50,
  ) {
    const safeLimit = Math.max(1, Math.min(100, limit));
    const safePage = Math.max(1, page);

    const qb = this.auditLogRepository.createQueryBuilder('log');

    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (adminId) {
      qb.andWhere('log.adminId = :adminId', { adminId });
    }
    if (targetType) {
      qb.andWhere('log.targetType = :targetType', { targetType });
    }
    if (targetId) {
      qb.andWhere('log.targetId = :targetId', { targetId });
    }

    qb.orderBy('log.createdAt', 'DESC');
    qb.skip((safePage - 1) * safeLimit).take(safeLimit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page: safePage,
        lastPage: Math.ceil(total / safeLimit),
      },
    };
  }

  async getListingDetails(listingId: string) {
    const listing = await this.listingsRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const owner = listing.ownerId
      ? await this.usersRepository.findOne({ where: { id: listing.ownerId } })
      : null;

    const signed = this.createSignedUrlHelpers();

    const signedOwnerAvatar = await signed.toDisplayUrlMaybe(owner?.avatarUrl);

    return {
      ...listing,
      photos: await signed.toDisplayUrls(listing.photos ?? []),
      owner: owner
        ? {
            id: owner.id,
            email: owner.email,
            fullName: owner.fullName ?? null,
            avatarUrl: signedOwnerAvatar,
            role: owner.role,
            isActive: owner.isActive,
            isVerified: owner.isVerified,
          }
        : null,
    };
  }

  async getDeliveryDetails(deliveryId: string) {
    const delivery = await this.deliveriesRepository.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException('Delivery not found');

    const listingPromise = this.listingsRepository.findOne({
      where: { id: delivery.listingId },
    });
    const carrierPromise = delivery.carrierId
      ? this.usersRepository.findOne({ where: { id: delivery.carrierId } })
      : Promise.resolve(null);

    const listing = await listingPromise;
    const ownerPromise = listing?.ownerId
      ? this.usersRepository.findOne({ where: { id: listing.ownerId } })
      : Promise.resolve(null);

    const [owner, carrier] = await Promise.all([ownerPromise, carrierPromise]);

    const signed = this.createSignedUrlHelpers();

    const [signedOwnerAvatar, signedCarrierAvatar] = await Promise.all([
      signed.toDisplayUrlMaybe(owner?.avatarUrl),
      signed.toDisplayUrlMaybe(carrier?.avatarUrl),
    ]);

    return {
      ...delivery,
      proofPhotos: await signed.toDisplayUrls(delivery.proofPhotos ?? []),
      listing: listing
        ? {
            id: listing.id,
            title: listing.title,
            ownerId: listing.ownerId,
            isActive: listing.isActive,
            photos: await signed.toDisplayUrls(listing.photos ?? []),
          }
        : null,
      owner: owner
        ? {
            id: owner.id,
            email: owner.email,
            fullName: owner.fullName ?? null,
            avatarUrl: signedOwnerAvatar,
            role: owner.role,
          }
        : null,
      carrier: carrier
        ? {
            id: carrier.id,
            email: carrier.email,
            fullName: carrier.fullName ?? null,
            avatarUrl: signedCarrierAvatar,
            role: carrier.role,
            isVerified: carrier.isVerified,
            isActive: carrier.isActive,
          }
        : null,
    };
  }

  async verifyUser(
    userId: string,
    isVerified: boolean,
    params?: { adminId?: string; meta?: AuditMeta },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role !== 'carrier') {
      throw new BadRequestException('Only carrier users can be verified/rejected');
    }

    const beforeVerified = user.isVerified;
    user.isVerified = isVerified;
    const saved = await this.usersRepository.save(user);
    if (params?.adminId) {
      await this.writeAuditLog({
        adminId: params.adminId,
        action: isVerified ? 'verifyUser' : 'rejectUser',
        meta: params.meta,
        target: { type: 'user', id: userId },
        details: {
          userId,
          beforeVerified,
          afterVerified: isVerified,
        },
      });
    }
    return this.withSignedAvatar(saved);
  }

  async setUserActiveStatus(
    userId: string,
    isActive: boolean,
    params?: { adminId?: string; meta?: AuditMeta },
  ): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === 'admin') {
      throw new BadRequestException('Admin users cannot be banned/unbanned');
    }

    const beforeActive = user.isActive;
    user.isActive = isActive;
    const saved = await this.usersRepository.save(user);
    if (params?.adminId) {
      await this.writeAuditLog({
        adminId: params.adminId,
        action: isActive ? 'unbanUser' : 'banUser',
        meta: params.meta,
        target: { type: 'user', id: userId },
        details: {
          userId,
          beforeActive,
          afterActive: isActive,
        },
      });
    }
    return this.withSignedAvatar(saved);
  }

  async setListingActiveStatus(
    listingId: string,
    isActive: boolean,
    params?: { adminId?: string; meta?: AuditMeta; reason?: string | null },
  ): Promise<Listing> {
    const listing = await this.listingsRepository.findOne({
      where: { id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');

    const before = listing.isActive;
    listing.isActive = isActive;
    const saved = await this.listingsRepository.save(listing);

    if (params?.adminId) {
      await this.writeAuditLog({
        adminId: params.adminId,
        action: isActive ? 'unhideListing' : 'hideListing',
        meta: params.meta,
        target: { type: 'listing', id: listingId },
        details: {
          listingId,
          beforeActive: before,
          afterActive: isActive,
          reason: params.reason ?? null,
        },
      });
    }

    return saved;
  }

  async forceCancelDelivery(
    deliveryId: string,
    params: { adminId?: string; meta?: AuditMeta; reason?: string | null },
  ): Promise<Delivery> {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');

    const before = delivery.status;
    if (delivery.status !== 'cancelled') {
      delivery.status = 'cancelled';
      delivery.trackingEnabled = false;
    }
    const saved = await this.deliveriesRepository.save(delivery);

    if (params.adminId) {
      await this.writeAuditLog({
        adminId: params.adminId,
        action: 'forceCancelDelivery',
        meta: params.meta,
        target: { type: 'delivery', id: deliveryId },
        details: { deliveryId, beforeStatus: before, afterStatus: saved.status, reason: params.reason ?? null },
      });
    }

    return saved;
  }

  async resolveDeliveryDispute(
    deliveryId: string,
    outcome: 'cancelled' | 'delivered',
    params: { adminId?: string; meta?: AuditMeta; note?: string | null },
  ): Promise<Delivery> {
    const delivery = await this.deliveriesRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    if (delivery.status !== 'disputed') {
      throw new BadRequestException('Only disputed deliveries can be resolved');
    }

    const before = delivery.status;
    delivery.status = outcome;
    if (outcome === 'delivered') {
      delivery.deliveredAt = delivery.deliveredAt ?? new Date();
    }
    if (outcome === 'cancelled') {
      delivery.trackingEnabled = false;
    }
    const saved = await this.deliveriesRepository.save(delivery);

    if (params.adminId) {
      await this.writeAuditLog({
        adminId: params.adminId,
        action: 'resolveDeliveryDispute',
        meta: params.meta,
        target: { type: 'delivery', id: deliveryId },
        details: { deliveryId, beforeStatus: before, afterStatus: outcome, note: params.note ?? null },
      });
    }

    return saved;
  }

  async sendPushToUser(params: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    adminId?: string;
    meta?: AuditMeta;
  }): Promise<{ ok: boolean; enabled: boolean; hasToken: boolean }>{
    const user = await this.usersRepository.findOne({ where: { id: params.userId } });
    const token = user?.fcmToken?.toString().trim();
    const hasToken = Boolean(token);

    let ok = false;
    if (token) {
      ok = await this.pushService.sendToToken({
        token,
        title: params.title,
        body: params.body,
        data: params.data,
      });
    }

    if (params.adminId) {
      await this.writeAuditLog({
        adminId: params.adminId,
        action: 'pushToUser',
        meta: params.meta,
        target: { type: 'user', id: params.userId },
        details: { ok, enabled: this.pushService.isEnabled(), hasToken, data: params.data ?? null },
      });
    }

    return { ok, enabled: this.pushService.isEnabled(), hasToken };
  }

  async broadcastPush(params: {
    title: string;
    body: string;
    role?: 'sender' | 'carrier' | 'admin';
    onlyActive?: boolean;
    limit?: number;
    data?: Record<string, string>;
    adminId?: string;
    meta?: AuditMeta;
  }): Promise<{ enabled: boolean; attempted: number; sent: number }>{
    const enabled = this.pushService.isEnabled();
    const limit = Math.max(1, Math.min(500, params.limit ?? 200));

    const qb = this.usersRepository.createQueryBuilder('u');
    qb.where('u.fcmToken IS NOT NULL');
    if (params.role) qb.andWhere('u.role = :role', { role: params.role });
    if (params.onlyActive === true) qb.andWhere('u.isActive = true');
    qb.orderBy('u.updatedAt', 'DESC');
    qb.take(limit);

    const users = await qb.getMany();
    const tokens = users
      .map((u) => u?.fcmToken?.toString().trim())
      .filter((t): t is string => Boolean(t));

    let sent = 0;
    if (enabled && tokens.length > 0) {
      const results = await Promise.all(
        tokens.map((token) =>
          this.pushService.sendToToken({
            token,
            title: params.title,
            body: params.body,
            data: params.data,
          }),
        ),
      );
      sent = results.filter(Boolean).length;
    }

    if (params.adminId) {
      await this.writeAuditLog({
        adminId: params.adminId,
        action: 'broadcastPush',
        meta: params.meta,
        details: {
          enabled,
          attempted: tokens.length,
          sent,
          role: params.role ?? null,
          onlyActive: params.onlyActive ?? null,
          limit,
          data: params.data ?? null,
        },
      });
    }

    return { enabled, attempted: tokens.length, sent };
  }
}
