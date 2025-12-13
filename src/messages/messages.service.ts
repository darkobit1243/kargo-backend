import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './message.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  async create(payload: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    const message = this.messageRepository.create(payload);
    return this.messageRepository.save(message);
  }

  async findByListingId(listingId: string, userId: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: [
      { listingId, senderId: userId },
      { listingId, carrierId: userId },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async findThreads(userId: string): Promise<Array<{ listingId: string; lastMessage: string; fromCarrier: boolean; createdAt: Date }>> {
    const rows = await this.messageRepository.find({
      where: [
        { senderId: userId },
        { carrierId: userId },
      ],
      order: { createdAt: 'DESC' },
    });
    const map = new Map<
      string,
      {
        listingId: string;
        lastMessage: string;
        fromCarrier: boolean;
        createdAt: Date;
        carrierId: string;
        senderId: string;
      }
    >();
    for (const row of rows) {
      if (!map.has(row.listingId)) {
        map.set(row.listingId, {
          listingId: row.listingId,
          lastMessage: row.content,
          fromCarrier: row.fromCarrier,
          createdAt: row.createdAt,
          carrierId: row.carrierId,
          senderId: row.senderId,
        });
      }
    }
    return Array.from(map.values());
  }
}

