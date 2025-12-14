import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateListingDto } from './dto/create-listing.dto';
import { Listing } from './listing.entity';
import { User } from '../auth/user.entity';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(ownerId: string, dto: CreateListingDto): Promise<Listing> {
    const listing = this.listingsRepository.create({
      ...dto,
      ownerId,
    });
    return this.listingsRepository.save(listing);
  }

  async findAll(): Promise<any[]> {
    const listings = await this.listingsRepository.find();
    const ownerIds = [...new Set(listings.map(l => l.ownerId))];
    const owners = await this.usersRepository.findByIds(ownerIds);
    const ownerMap = new Map(owners.map(o => [o.id, o]));

    return listings.map(l => {
      const owner = ownerMap.get(l.ownerId);
      return {
        ...l,
        ownerName: owner?.fullName ?? owner?.email ?? 'Gönderici',
        ownerAvatar: owner?.avatarUrl ?? null,
        ownerRating: owner?.rating ?? null,
        ownerDelivered: owner?.deliveredCount ?? null,
      };
    });
  }

  async findOne(id: string): Promise<Listing | null> {
    return this.listingsRepository.findOne({ where: { id } });
  }

  async findByOwner(ownerId: string): Promise<Listing[]> {
    return this.listingsRepository.find({ where: { ownerId } });
  }
}
