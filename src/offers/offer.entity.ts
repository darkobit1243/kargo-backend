import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type OfferStatus = 'pending' | 'accepted' | 'rejected';

@Entity({ name: 'offers' })
export class Offer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  listingId: string;

  @Column()
  proposerId: string;

  @Column('float')
  amount: number;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'varchar' })
  status: OfferStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}


