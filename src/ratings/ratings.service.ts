import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRatingDto } from './dto/create-rating.dto';
import { Rating } from './rating.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { Listing } from '../listings/listing.entity';
import { User } from '../auth/user.entity';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingsRepo: Repository<Rating>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Delivery)
    private readonly deliveriesRepo: Repository<Delivery>,
    @InjectRepository(Listing)
    private readonly listingsRepo: Repository<Listing>,
  ) {}

  async create(fromUserId: string, dto: CreateRatingDto): Promise<Rating> {
    const delivery = await this.deliveriesRepo.findOne({ where: { id: dto.deliveryId } });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.status !== 'delivered') {
      throw new BadRequestException('Delivery is not delivered yet');
    }

    if (!delivery.carrierId) {
      throw new BadRequestException('Delivery has no carrier');
    }

    const listing = await this.listingsRepo.findOne({ where: { id: delivery.listingId } });
    if (!listing) {
      throw new NotFoundException('Listing not found for delivery');
    }

    const ownerId = listing.ownerId;
    const carrierId = delivery.carrierId;

    // Only sender -> carrier rating is allowed.
    if (fromUserId !== ownerId) {
      throw new ForbiddenException('Only the sender can rate the carrier');
    }

    const toUserId = carrierId;

    const rating = this.ratingsRepo.create({
      fromUserId,
      toUserId,
      deliveryId: dto.deliveryId,
      score: dto.score,
      comment: dto.comment,
    });

    try {
      const saved = await this.ratingsRepo.save(rating);
      const avg = await this.getAverageScore(toUserId);
      await this.usersRepo.update({ id: toUserId }, { rating: avg });
      return saved;
    } catch (err: any) {
      // Postgres unique_violation
      if (err?.code === '23505') {
        throw new ConflictException('You already rated this delivery');
      }
      throw err;
    }
  }

  async findByUser(userId: string): Promise<Rating[]> {
    return this.ratingsRepo.find({
      where: { toUserId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findGivenByUser(fromUserId: string): Promise<Rating[]> {
    return this.ratingsRepo.find({
      where: { fromUserId },
      order: { createdAt: 'DESC' },
    });
  }

  async getAverageScore(userId: string): Promise<number> {
    const raw = await this.ratingsRepo
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'avg')
      .where('r.toUserId = :userId', { userId })
      .getRawOne<{ avg: string | null }>();

    const avg = raw?.avg ? Number(raw.avg) : 0;
    return Number.isFinite(avg) ? avg : 0;
  }
}
