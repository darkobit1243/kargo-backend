import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, type UserRole } from './user.entity';
import { RegisterUserDto } from './dto/register-user.dto';

export type AuthResponseUser = {
  id: string;
  publicId?: number;
  email: string;
  role: UserRole;
  fullName?: string;
  phone?: string;
  address?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  serviceArea?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  private sanitize(user: User): AuthResponseUser {
    const { id, publicId, email, role, fullName, phone, address, vehicleType, vehiclePlate, serviceArea } = user;
    const resolvedRole: UserRole = role ?? 'sender';
    return {
      id,
      publicId,
      email,
      role: resolvedRole,
      fullName,
      phone,
      address,
      vehicleType,
      vehiclePlate,
      serviceArea,
    };
  }

  private async ensurePublicId(userId: string): Promise<User> {
    const existing = await this.usersRepository.findOne({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.publicId != null) return existing;

    // Lazily assign a sequential publicId with a table lock to avoid duplicates.
    return this.usersRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const fresh = await repo.findOne({ where: { id: userId } });
      if (!fresh) {
        throw new NotFoundException('User not found');
      }
      if (fresh.publicId != null) return fresh;

      await manager.query('LOCK TABLE users IN EXCLUSIVE MODE');
      const rows = await manager.query('SELECT COALESCE(MAX("publicId"), 0) + 1 AS next FROM users');
      const next = Number(rows?.[0]?.next ?? 1);
      fresh.publicId = next;
      return repo.save(fresh);
    });
  }

  private signToken(user: User): string {
    const resolvedRole: UserRole = user.role ?? 'sender';
    return this.jwtService.sign({ sub: user.id, email: user.email, role: resolvedRole });
  }

  async register(user: RegisterUserDto): Promise<{ token: string; role: UserRole; user: AuthResponseUser }> {
    const existing = await this.usersRepository.findOne({ where: { email: user.email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashed = await bcrypt.hash(user.password, 10);
    const newUser = this.usersRepository.create({
      email: user.email,
      password: hashed,
      role: user.role,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      rating: user.rating,
      deliveredCount: user.deliveredCount,
      address: user.address,
      vehicleType: user.vehicleType,
      vehiclePlate: user.vehiclePlate,
      serviceArea: user.serviceArea,
    });

    // Assign sequential publicId at creation time.
    const saved = await this.usersRepository.manager.transaction(async (manager) => {
      await manager.query('LOCK TABLE users IN EXCLUSIVE MODE');
      const rows = await manager.query('SELECT COALESCE(MAX("publicId"), 0) + 1 AS next FROM users');
      const next = Number(rows?.[0]?.next ?? 1);
      const repo = manager.getRepository(User);
      const created = repo.create({ ...newUser, publicId: next });
      return repo.save(created);
    });
    return {
      token: this.signToken(saved),
      role: saved.role,
      user: this.sanitize(saved),
    };
  }

  async login(user: { email: string; password: string }): Promise<{ token: string; role: UserRole; user: AuthResponseUser }> {
    const found = await this.usersRepository.findOne({ where: { email: user.email } });
    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password || !found.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(user.password, found.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      token: this.signToken(found),
      role: found.role,
      user: this.sanitize(found),
    };
  }

  async findById(id: string): Promise<AuthResponseUser> {
    const user = await this.ensurePublicId(id);
    return this.sanitize(user);
  }

  async updateFcmToken(userId: string, token: string | null): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.fcmToken = token && token.trim().length > 0 ? token.trim() : null;
    await this.usersRepository.save(user);
  }
}
