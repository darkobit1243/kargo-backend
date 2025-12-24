import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminAuditLog } from './admin-audit-log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, MoreThanOrEqual } from 'typeorm';
import { User, UserRole } from '../auth/user.entity';
import { Listing } from '../listings/listing.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { S3Service } from '../common/s3.service';

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

  async getStats() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const totalUsers = await this.usersRepository.count();
    const totalCarriers = await this.usersRepository.count({
      where: { role: 'carrier' },
    });
    const totalSenders = await this.usersRepository.count({
      where: { role: 'sender' },
    });
    const pendingVerifications = await this.usersRepository.count({
      where: { role: 'carrier', isVerified: false },
    });

    const totalListings = await this.listingsRepository.count();
    const totalDeliveries = await this.deliveriesRepository.count();

    const newUsersLast7Days = await this.usersRepository.count({
      where: { createdAt: MoreThanOrEqual(since) },
    });
    const newListingsLast7Days = await this.listingsRepository.count({
      where: { createdAt: MoreThanOrEqual(since) },
    });
    const newDeliveriesLast7Days = await this.deliveriesRepository.count({
      where: { createdAt: MoreThanOrEqual(since) },
    });

    return {
      users: {
        total: totalUsers,
        carriers: totalCarriers,
        senders: totalSenders,
        pending: pendingVerifications,
      },
      listings: { total: totalListings },
      deliveries: { total: totalDeliveries },
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

  async verifyUser(userId: string, isVerified: boolean, adminId?: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.isVerified = isVerified;
    const saved = await this.usersRepository.save(user);
    if (adminId) {
      await this.auditLogRepository.save({
        adminId,
        action: isVerified ? 'verifyUser' : 'rejectUser',
        details: { userId },
      });
    }
    return this.withSignedAvatar(saved);
  }

  async setUserActiveStatus(userId: string, isActive: boolean, adminId?: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = isActive;
    const saved = await this.usersRepository.save(user);
    if (adminId) {
      await this.auditLogRepository.save({
        adminId,
        action: isActive ? 'unbanUser' : 'banUser',
        details: { userId },
      });
    }
    return this.withSignedAvatar(saved);
  }
}
