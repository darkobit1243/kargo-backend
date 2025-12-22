import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Listing } from '../listings/listing.entity';
import { Offer } from '../offers/offer.entity';
import { Message } from './message.entity';
import { User } from '../auth/user.entity';
import { PushService } from '../push/push.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Offer)
    private readonly offerRepository: Repository<Offer>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly pushService: PushService,
  ) {}

  private isOfferSystemMessage(message: Pick<Message, 'content'>): boolean {
    const c = (message?.content ?? '').trim();
    if (!c) return false;
    return c.startsWith('Taşıyıcı teklif verdi');
  }

  private async sendNewMessagePush(message: Message): Promise<void> {
    if (this.isOfferSystemMessage(message)) return;

    const listingId = message.listingId;
    const listing = await this.listingRepository.findOne({ where: { id: listingId } });
    const listingTitle = (listing?.title ?? 'Gönderi').toString();

    const senderUserId = message.fromCarrier ? message.carrierId : message.senderId;
    const recipientUserId = message.fromCarrier ? message.senderId : message.carrierId;
    if (!senderUserId || !recipientUserId) return;
    if (senderUserId === recipientUserId) return;

    const [senderUser, recipientUser] = await Promise.all([
      this.userRepository.findOne({ where: { id: senderUserId } }),
      this.userRepository.findOne({ where: { id: recipientUserId } }),
    ]);

    const token = recipientUser?.fcmToken?.toString().trim();
    if (!token) return;

    const senderName = (senderUser?.fullName ?? senderUser?.email ?? 'Bir kullanıcı').toString();
    const snippetRaw = (message.content ?? '').toString().replace(/\s+/g, ' ').trim();
    const snippet = snippetRaw.length > 120 ? `${snippetRaw.slice(0, 117)}...` : snippetRaw;

    await this.pushService.sendToToken({
      token,
      title: 'Yeni mesaj',
      body: `${senderName}: ${snippet} (${listingTitle})`,
      data: {
        type: 'message',
        listingId: listingId,
        messageId: message.id,
      },
    });
  }

  async create(payload: Omit<Message, 'id' | 'createdAt'>): Promise<Message> {
    const message = this.messageRepository.create(payload);
    const saved = await this.messageRepository.save(message);
    try {
      await this.sendNewMessagePush(saved);
    } catch (_) {
      // Ignore push failures.
    }
    return saved;
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

  async getCarrierContacts(ownerId: string) {
    const listings = await this.listingRepository.find({ where: { ownerId } });
    if (!listings.length) {
      return [];
    }
    const listingMap = new Map(listings.map(listing => [listing.id, listing]));
    const listingIds = listings.map(listing => listing.id);
    const offers = await this.offerRepository.find({
      where: { listingId: In(listingIds) },
      order: { createdAt: 'DESC' },
    });
    const contacts = new Map<string, { carrierId: string; listingId: string; listingTitle: string }>();
    for (const offer of offers) {
      if (!contacts.has(offer.proposerId)) {
        const listing = listingMap.get(offer.listingId);
        contacts.set(offer.proposerId, {
          carrierId: offer.proposerId,
          listingId: offer.listingId,
          listingTitle: listing?.title ?? 'Gönderi',
        });
      }
    }
    if (!contacts.size) return [];
    const carrierIds = Array.from(contacts.keys());
    const users = await this.userRepository.findByIds(carrierIds);
    const userMap = new Map(users.map(user => [user.id, { email: user.email, fullName: user.fullName }]));
    return Array.from(contacts.values()).map(entry => ({
      ...entry,
      carrierEmail: userMap.get(entry.carrierId)?.email ?? 'Carrier',
      carrierName: userMap.get(entry.carrierId)?.fullName ?? userMap.get(entry.carrierId)?.email ?? 'Carrier',
    }));
  }

  async getSenderContacts() {
    // For carriers: show senders who have active listings
    const listings = await this.listingRepository.find({
      order: { createdAt: 'DESC' },
      take: 50, // Limit to prevent too many results
    });
    if (!listings.length) {
      return [];
    }
    const senderIds = [...new Set(listings.map(listing => listing.ownerId))];
    const users = await this.userRepository.findByIds(senderIds);
    const userMap = new Map(users.map(user => [user.id, { email: user.email, fullName: user.fullName }]));
    const listingCounts = new Map<string, number>();
    for (const listing of listings) {
      listingCounts.set(listing.ownerId, (listingCounts.get(listing.ownerId) ?? 0) + 1);
    }
    return senderIds.map(senderId => ({
      senderId,
      senderEmail: userMap.get(senderId)?.email ?? 'Sender',
      senderName: userMap.get(senderId)?.fullName ?? 'Gönderici',
      activeListingsCount: listingCounts.get(senderId) ?? 0,
    }));
  }
}

