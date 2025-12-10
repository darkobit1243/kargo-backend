import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DeliveryStatus = 'pickup_pending' | 'in_transit' | 'delivered';

@Entity({ name: 'deliveries' })
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  listingId: string;

  @Column({ nullable: true })
  carrierId?: string;

  @Column({ type: 'varchar' })
  status: DeliveryStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  pickupAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date;
}


