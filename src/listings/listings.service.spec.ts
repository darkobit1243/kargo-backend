import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ListingsService } from './listings.service';
import { Listing } from './listing.entity';
import { User } from '../auth/user.entity';
import { Offer } from '../offers/offer.entity';
import { S3Service } from '../common/s3.service';

describe('ListingsService', () => {
  let service: ListingsService;

  const listingsRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const usersRepository = {
    findByIds: jest.fn(),
    find: jest.fn(),
  };

  const offersRepository = {
    find: jest.fn(),
  };

  const s3Service = {
    toDisplayUrl: jest.fn(async (key: string) => key),
    toDisplayUrls: jest.fn(async (keys: string[]) => keys),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListingsService,
        { provide: getRepositoryToken(Listing), useValue: listingsRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Offer), useValue: offersRepository },
        { provide: S3Service, useValue: s3Service },
      ],
    }).compile();

    service = module.get<ListingsService>(ListingsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
