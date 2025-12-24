import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'listings' })
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  ownerId: string;

  @Column('text', { array: true })
  photos: string[];

  @Column('float')
  weight: number;

  @Column({ type: 'jsonb' })
  dimensions: { length: number; width: number; height: number };

  @Column()
  fragile: boolean;

  @Column({ type: 'jsonb' })
  pickup_location: { lat: number; lng: number };

  @Column({ type: 'jsonb' })
  dropoff_location: { lat: number; lng: number };

  // Receiver (alıcı) phone number at dropoff.
  @Column({ type: 'varchar', nullable: true })
  receiver_phone?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
