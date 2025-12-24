import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { User } from './user.entity';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;

  const usersRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };

  const jwtService = {
    sign: jest.fn(),
  };

  const configService = {
    get: jest.fn((_key: string, defaultValue?: any) => defaultValue),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    jest.clearAllMocks();
    (bcrypt.hash as unknown as jest.Mock).mockResolvedValue('hashed');
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);
    jwtService.sign.mockReturnValue('jwt-token');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('register throws when email already exists', async () => {
    usersRepository.findOne.mockResolvedValue({ id: 'u1' });
    await expect(
      service.register({
        email: 'a@b.com',
        password: 'pw',
        role: 'sender',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('register returns token + sanitized user and assigns publicId', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    usersRepository.create.mockImplementation((x: any) => x);

    usersRepository.manager.transaction.mockImplementation(
      async (fn: (manager: any) => Promise<any>) => {
        const repo = {
          create: jest.fn((x: any) => x),
          save: jest.fn(async (x: any) => x),
        };
        const manager = {
          query: jest
            .fn()
            .mockResolvedValueOnce(undefined) // LOCK TABLE
            .mockResolvedValueOnce([{ next: 7 }]), // SELECT next publicId
          getRepository: jest.fn(() => repo),
        };
        return fn(manager);
      },
    );

    const res = await service.register({
      email: 'a@b.com',
      password: 'pw',
      role: 'sender',
      fullName: 'Test User',
      phone: '+905555555555',
    } as any);

    expect(res.token).toBe('jwt-token');
    expect(res.user).toMatchObject({
      email: 'a@b.com',
      role: 'sender',
      fullName: 'Test User',
      phone: '+905555555555',
      publicId: 7,
    });
  });

  it('login throws when user not found', async () => {
    usersRepository.findOne.mockResolvedValue(null);
    await expect(
      service.login({ email: 'a@b.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login throws when password invalid', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      password: 'hashed',
      role: 'sender',
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login returns token + sanitized user when password valid', async () => {
    usersRepository.findOne.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      password: 'hashed',
      role: 'carrier',
      publicId: 3,
    });
    (bcrypt.compare as unknown as jest.Mock).mockResolvedValue(true);

    const res = await service.login({ email: 'a@b.com', password: 'pw' });
    expect(res.token).toBe('jwt-token');
    expect(res.role).toBe('carrier');
    expect(res.user).toMatchObject({
      id: 'u1',
      email: 'a@b.com',
      role: 'carrier',
      publicId: 3,
    });
  });
});
