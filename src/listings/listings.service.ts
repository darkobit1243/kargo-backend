import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateListingDto } from './dto/create-listing.dto';
import { Listing } from './listing.entity';
import { User } from '../auth/user.entity';
import { Offer } from '../offers/offer.entity';

import { S3Service } from '../common/s3.service';

@Injectable()
export class ListingsService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingsRepository: Repository<Listing>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Offer)
    private readonly offersRepository: Repository<Offer>,
    private readonly s3Service: S3Service,
  ) {}

  async create(ownerId: string, dto: CreateListingDto): Promise<Listing> {
    const photoUrls: string[] = [];
    if (dto.photos && Array.isArray(dto.photos)) {
      for (const photo of dto.photos) {
        // Assume photos are Base64 strings or already URLs
        const url = await this.s3Service.uploadBase64(photo, 'listings');
        photoUrls.push(url);
      }
    }

    // Replace photos with S3 URLs
    const finalDto = { ...dto, photos: photoUrls };

    const pickupPoint = {
      type: 'Point',
      coordinates: [dto.pickup_location.lng, dto.pickup_location.lat],
    };
    const dropoffPoint = {
      type: 'Point',
      coordinates: [dto.dropoff_location.lng, dto.dropoff_location.lat],
    };

    const listing = this.listingsRepository.create({
      ...finalDto,
      ownerId,
      pickup_point: pickupPoint as any,
      dropoff_point: dropoffPoint as any,
    });
    return this.listingsRepository.save(listing);
  }

  async findNearby(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<Listing[]> {
    const radiusMeters = radiusKm * 1000;

    const accepted = await this.offersRepository.find({
      where: { status: 'accepted' },
    });
    const acceptedListingIds = accepted.map((o) => o.listingId).filter(Boolean);

    const qb = this.listingsRepository.createQueryBuilder('listing');

    if (acceptedListingIds.length > 0) {
      qb.where('listing.id NOT IN (:...ids)', { ids: acceptedListingIds });
    }

    // ST_DWithin(geometry, geometry, meters) -> cast to geography for meters
    qb.andWhere(
      `ST_DWithin(
        listing.pickup_point::geography,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
        :radius
      )`,
      { lng, lat, radius: radiusMeters },
    );

    qb.orderBy(
      `ST_Distance(
        listing.pickup_point::geography,
        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
      )`,
      'ASC',
    );

    const listings = await qb.getMany();

    const ownerIds = [...new Set(listings.map((l) => l.ownerId))];
    const owners = ownerIds.length
      ? await this.usersRepository.findByIds(ownerIds)
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    return listings.map((l) => {
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

  async findAll(): Promise<any[]> {
    const accepted = await this.offersRepository.find({
      where: { status: 'accepted' },
    });
    const acceptedListingIds = new Set(
      accepted.map((o) => o.listingId).filter(Boolean),
    );

    const listings = (await this.listingsRepository.find()).filter(
      (l) => !acceptedListingIds.has(l.id),
    );
    const ownerIds = [...new Set(listings.map((l) => l.ownerId))];
    const owners = ownerIds.length
      ? await this.usersRepository.findByIds(ownerIds)
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    return listings.map((l) => {
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
