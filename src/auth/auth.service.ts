import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(user: { email: string; password: string }): Promise<User> {
    const existing = await this.usersRepository.findOne({ where: { email: user.email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashed = await bcrypt.hash(user.password, 10);
    const newUser = this.usersRepository.create({
      email: user.email,
      password: hashed,
    });
    return this.usersRepository.save(newUser);
  }

  async login(user: { email: string; password: string }): Promise<{ token: string }> {
    const found = await this.usersRepository.findOne({ where: { email: user.email } });
    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(user.password, found.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.jwtService.sign({ sub: found.id, email: found.email });
    return { token };
  }
}
