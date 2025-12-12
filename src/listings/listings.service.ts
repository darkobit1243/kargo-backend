import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateListingDto } from './dto/create-listing.dto';
import { Listing } from './listing.entity';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
  ) {}

  async create(ownerId: string, dto: CreateListingDto): Promise<Listing> {
    const listing = this.listingsRepository.create({
      ...dto,
      ownerId,
    });
    return this.listingsRepository.save(listing);
  }

  async findAll(): Promise<Listing[]> {
    return this.listingsRepository.find();
  }

  async findOne(id: string): Promise<Listing | null> {
    return this.listingsRepository.findOne({ where: { id } });
  }

  async findByOwner(ownerId: string): Promise<Listing[]> {
    return this.listingsRepository.find({ where: { ownerId } });
  }
}
