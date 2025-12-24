import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OffersService } from './offers.service';
import { WsGateway } from '../ws/ws.gateway';
import { PushService } from '../push/push.service';
import { Offer } from './offer.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Listing } from '../listings/listing.entity';
import { Message } from '../messages/message.entity';
import { User } from '../auth/user.entity';

describe('OffersService', () => {
  let service: OffersService;

  const wsGateway = {
    sendDeliveryUpdate: jest.fn(),
    sendOfferNotification: jest.fn(),
    sendMessage: jest.fn(),
  };

  const pushService = {
    sendToToken: jest.fn(),
  };

  const offersRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const deliveriesRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const listingsRepository = { findOne: jest.fn(), find: jest.fn() };
  const messagesRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const usersRepository = {
    findOne: jest.fn(),
    findByIds: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OffersService,
        { provide: WsGateway, useValue: wsGateway },
        { provide: PushService, useValue: pushService },
        { provide: getRepositoryToken(Offer), useValue: offersRepository },
        {
          provide: getRepositoryToken(Delivery),
          useValue: deliveriesRepository,
        },
        { provide: getRepositoryToken(Listing), useValue: listingsRepository },
        { provide: getRepositoryToken(Message), useValue: messagesRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
      ],
    }).compile();

    service = module.get<OffersService>(OffersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
