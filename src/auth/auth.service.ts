import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, type UserRole } from './user.entity';
import { RegisterUserDto } from './dto/register-user.dto';

export type AuthResponseUser = {
  id: string;
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
    const { id, email, role, fullName, phone, address, vehicleType, vehiclePlate, serviceArea } = user;
    const resolvedRole: UserRole = role ?? 'sender';
    return {
      id,
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
    const saved = await this.usersRepository.save(newUser);
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
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitize(user);
  }
}
