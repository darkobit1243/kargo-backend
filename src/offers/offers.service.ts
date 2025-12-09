import { Injectable } from '@nestjs/common';
import { WsGateway } from '../ws/ws.gateway';

export interface Offer {
  id: string;
  listingId: string;
  proposerId: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected';
}

@Injectable()
export class OffersService {
  private offers: Offer[] = [];

  constructor(private wsGateway: WsGateway) {}

  // Teklif oluştur
  create(dto: { listingId: string; proposerId: string; amount: number }): Offer {
    const offer: Offer = { id: Date.now().toString(), ...dto, status: 'pending' };
    this.offers.push(offer);
    this.wsGateway.sendOfferNotification(dto.listingId, offer);
    return offer;
  }

  // Teklifleri listele
  findByListing(listingId: string): Offer[] {
    return this.offers.filter(o => o.listingId === listingId);
  }

  // Teklifi reddet
  rejectOffer(id: string): Offer | undefined {
    const offer = this.offers.find(o => o.id === id);
    if (offer) offer.status = 'rejected';
    return offer;
  }

  // Teklifi kabul et
  acceptOffer(id: string): Offer | undefined {
    const offer = this.offers.find(o => o.id === id);
    if (!offer) return undefined;

    // Aynı listing için daha önce kabul edilmiş teklif varsa hepsini reddet
    this.offers.forEach(o => {
      if (o.listingId === offer.listingId) {
        o.status = o.id === id ? 'accepted' : 'rejected';
      }
    });

    return offer;
  }
}
