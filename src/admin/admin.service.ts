import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminAuditLog } from './admin-audit-log.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { User, UserRole } from '../auth/user.entity';
import { Listing } from '../listings/listing.entity';
import { Delivery } from '../deliveries/delivery.entity';

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
  ) {}

  async getStats() {
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

    return {
      users: {
        total: totalUsers,
        carriers: totalCarriers,
        senders: totalSenders,
        pending: pendingVerifications,
      },
      listings: { total: totalListings },
      deliveries: { total: totalDeliveries },
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

    return {
      data: users,
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
    return saved;
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
    return saved;
  }
}
