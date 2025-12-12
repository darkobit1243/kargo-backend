import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, type UserRole } from './user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(user: { email: string; password: string; role?: UserRole }): Promise<{
    token: string;
    role: UserRole;
    user: { id: string; email: string; role: UserRole };
  }> {
    const existing = await this.usersRepository.findOne({ where: { email: user.email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashed = await bcrypt.hash(user.password, 10);
    const newUser = this.usersRepository.create({
      email: user.email,
      password: hashed,
      role: user.role ?? 'sender',
    });
    const saved = await this.usersRepository.save(newUser);
    const token = this.jwtService.sign({
      sub: saved.id,
      email: saved.email,
      role: saved.role,
    });
    return {
      token,
      role: saved.role,
      user: { id: saved.id, email: saved.email, role: saved.role },
    };
  }

  async login(user: { email: string; password: string }): Promise<{
    token: string;
    role: UserRole;
    user: { id: string; email: string; role: UserRole };
  }> {
    const found = await this.usersRepository.findOne({ where: { email: user.email } });
    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Hem gelen şifre hem de DB'deki hash gerçekten dolu mu kontrol et.
    // Aksi halde bcrypt.compare "data and hash arguments required" hatası fırlatıyor.
    if (!user.password || !found.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(user.password, found.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({ sub: found.id, email: found.email, role: found.role });
    return { token, role: found.role, user: { id: found.id, email: found.email, role: found.role } };
  }
}
