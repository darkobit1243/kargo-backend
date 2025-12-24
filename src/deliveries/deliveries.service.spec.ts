import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeliveriesService } from './deliveries.service';
import { WsGateway } from '../ws/ws.gateway';
import { Delivery } from './delivery.entity';
import { Listing } from '../listings/listing.entity';
import { Offer } from '../offers/offer.entity';
import { User } from '../auth/user.entity';
import { SmsService } from '../sms/sms.service';
import { PushService } from '../push/push.service';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../common/s3.service';

describe('DeliveriesService', () => {
  let service: DeliveriesService;

  const wsGateway = {
    sendDeliveryUpdate: jest.fn(),
    sendOfferNotification: jest.fn(),
    sendMessage: jest.fn(),
  };

  const deliveriesRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const listingsRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const offersRepository = {
    find: jest.fn(),
  };

  const usersRepository = {
    createQueryBuilder: jest.fn(),
  };

  const smsService = {
    sendSms: jest.fn().mockResolvedValue(true),
  };

  const pushService = {
    sendToToken: jest.fn().mockResolvedValue(true),
  };

  const configService = {
    get: jest.fn(),
  };

  const s3Service = {
    toDisplayUrl: jest.fn(async (key: string) => key),
    toDisplayUrls: jest.fn(async (keys: string[]) => keys),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveriesService,
        { provide: WsGateway, useValue: wsGateway },
        { provide: SmsService, useValue: smsService },
        { provide: PushService, useValue: pushService },
        { provide: S3Service, useValue: s3Service },
        { provide: ConfigService, useValue: configService },
        {
          provide: getRepositoryToken(Delivery),
          useValue: deliveriesRepository,
        },
        { provide: getRepositoryToken(Listing), useValue: listingsRepository },
        { provide: getRepositoryToken(Offer), useValue: offersRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
      ],
    }).compile();

    service = module.get<DeliveriesService>(DeliveriesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('deliver should forbid when carrierId mismatches', async () => {
    deliveriesRepository.findOne.mockResolvedValue({
      id: 'd1',
      status: 'in_transit',
      carrierId: 'carrier_a',
      listingId: 'l1',
    });

    await expect(service.deliver('d1', 'carrier_b')).rejects.toThrow(
      'Bu teslimatın taşıyıcısı değilsiniz',
    );
  });

  it('deliver should set delivered and bump deliveredCount for carrier and owner', async () => {
    const delivery = {
      id: 'd1',
      status: 'in_transit',
      carrierId: 'carrier_a',
      listingId: 'l1',
    };
    deliveriesRepository.findOne.mockResolvedValue(delivery);
    deliveriesRepository.save.mockImplementation(async (d: any) => d);
    listingsRepository.findOne.mockResolvedValue({
      id: 'l1',
      ownerId: 'owner_a',
    });

    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    usersRepository.createQueryBuilder.mockReturnValue(qb);

    const result = await service.deliver('d1', 'carrier_a');
    expect(result?.status).toBe('delivered');
    expect(wsGateway.sendDeliveryUpdate).toHaveBeenCalled();
    expect(usersRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
  });
});
