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
  ) { }

  async create(ownerId: string, dto: CreateListingDto): Promise<Listing> {
    const photoUrls: string[] = [];
    if (dto.photos && Array.isArray(dto.photos)) {
      for (const photo of dto.photos) {
        const keyOrValue = await this.s3Service.uploadBase64(photo, 'listings');
        photoUrls.push(keyOrValue);
      }
    }

    const finalDto = { ...dto, photos: photoUrls };

    const listing = this.listingsRepository.create({
      ...finalDto,
      ownerId,
    });
    const saved = await this.listingsRepository.save(listing);
    return {
      ...saved,
      photos: await this.s3Service.toDisplayUrls(saved.photos),
    };
  }

  async findNearby(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<Listing[]> {
    const accepted = await this.offersRepository.find({
      where: { status: 'accepted' },
    });
    const acceptedListingIds = accepted.map((o) => o.listingId).filter(Boolean);

    const qb = this.listingsRepository.createQueryBuilder('listing');

    qb.andWhere('listing.isActive = true');

    if (acceptedListingIds.length > 0) {
      qb.where('listing.id NOT IN (:...ids)', { ids: acceptedListingIds });
    }

    // Haversine Formula (No PostGIS required)
    // 6371 * acos(cos(radians(:lat)) * cos(radians((pickup_location->>'lat')::float)) * cos(radians((pickup_location->>'lng')::float) - radians(:lng)) + sin(radians(:lat)) * sin(radians((pickup_location->>'lat')::float)))
    const distanceSql = `
      (6371 * acos(
        cos(radians(:lat)) * 
        cos(radians((listing.pickup_location->>'lat')::float)) * 
        cos(radians((listing.pickup_location->>'lng')::float) - radians(:lng)) + 
        sin(radians(:lat)) * 
        sin(radians((listing.pickup_location->>'lat')::float))
      ))
    `;

    qb.andWhere(`${distanceSql} <= :radius`, { lat, lng, radius: radiusKm });
    qb.addSelect(distanceSql, 'distance');
    qb.orderBy('distance', 'ASC');

    const listings = await qb.getMany();

    const ownerIds = [...new Set(listings.map((l) => l.ownerId))];
    const owners = ownerIds.length
      ? await this.usersRepository.findByIds(ownerIds)
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    const signedOwnerAvatar = new Map<string, string | null>();
    await Promise.all(
      owners.map(async (o) => {
        signedOwnerAvatar.set(
          o.id,
          o.avatarUrl ? await this.s3Service.toDisplayUrl(o.avatarUrl) : null,
        );
      }),
    );

    return Promise.all(
      listings.map(async (l) => {
      const owner = ownerMap.get(l.ownerId);
      return {
        ...l,
        photos: await this.s3Service.toDisplayUrls(l.photos),
        ownerName: owner?.fullName ?? owner?.email ?? 'Gönderici',
          ownerAvatar: owner ? (signedOwnerAvatar.get(owner.id) ?? null) : null,
        ownerRating: owner?.rating ?? null,
        ownerDelivered: owner?.deliveredCount ?? null,
      };
      }),
    );
  }

  async findAll(): Promise<any[]> {
    const accepted = await this.offersRepository.find({
      where: { status: 'accepted' },
    });
    const acceptedListingIds = new Set(
      accepted.map((o) => o.listingId).filter(Boolean),
    );

    const listings = (await this.listingsRepository.find({ where: { isActive: true } })).filter(
      (l) => !acceptedListingIds.has(l.id),
    );
    const ownerIds = [...new Set(listings.map((l) => l.ownerId))];
    const owners = ownerIds.length
      ? await this.usersRepository.findByIds(ownerIds)
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o]));

    const signedOwnerAvatar = new Map<string, string | null>();
    await Promise.all(
      owners.map(async (o) => {
        signedOwnerAvatar.set(
          o.id,
          o.avatarUrl ? await this.s3Service.toDisplayUrl(o.avatarUrl) : null,
        );
      }),
    );

    return Promise.all(
      listings.map(async (l) => {
      const owner = ownerMap.get(l.ownerId);
      return {
        ...l,
        photos: await this.s3Service.toDisplayUrls(l.photos),
        ownerName: owner?.fullName ?? owner?.email ?? 'Gönderici',
          ownerAvatar: owner ? (signedOwnerAvatar.get(owner.id) ?? null) : null,
        ownerRating: owner?.rating ?? null,
        ownerDelivered: owner?.deliveredCount ?? null,
      };
      }),
    );
  }

  async findOne(id: string): Promise<Listing | null> {
    const listing = await this.listingsRepository.findOne({ where: { id, isActive: true } });
    if (!listing) return null;
    return {
      ...listing,
      photos: await this.s3Service.toDisplayUrls(listing.photos),
    };
  }

  async findByOwner(ownerId: string): Promise<Listing[]> {
    const listings = await this.listingsRepository.find({ where: { ownerId } });
    return Promise.all(
      listings.map(async (l) => ({
        ...l,
        photos: await this.s3Service.toDisplayUrls(l.photos),
      })),
    );
  }
}
