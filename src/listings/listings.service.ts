import { Injectable } from '@nestjs/common';
import { CreateListingDto } from './dto/create-listing.dto';

export interface Listing {
  id: string;
  title: string;
  description: string;
  photos: string[];
  weight: number;
  dimensions: { length: number; width: number; height: number };
  fragile: boolean;
  pickup_location: { lat: number; lng: number };
  dropoff_location: { lat: number; lng: number };
}

@Injectable()
export class ListingsService {
  private listings: Listing[] = [];

  create(dto: CreateListingDto): Listing {
    const newListing: Listing = { id: Date.now().toString(), ...dto };
    this.listings.push(newListing);
    return newListing;
  }

  findAll(): Listing[] {
    return this.listings;
  }

  findOne(id: string): Listing | undefined {
    return this.listings.find(l => l.id === id);
  }
}
