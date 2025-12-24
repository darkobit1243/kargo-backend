import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DeliveryStatus =
  | 'pickup_pending'
  | 'in_transit'
  | 'at_door'
  | 'delivered'
  | 'cancelled'
  | 'disputed';

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

  // Delivery confirmation code (OTP). For now, sending auto-approves delivery.
  @Column({ nullable: true })
  deliveryOtp?: string;

  @Column({ type: 'timestamptz', nullable: true })
  deliveryOtpSentAt?: Date;

  // Sender shows this QR token; carrier must scan and provide it to pick up.
  @Column({ nullable: true })
  pickupQrToken?: string;

  // Live tracking becomes active after successful QR-validated pickup.
  @Column({ type: 'boolean', default: false })
  trackingEnabled: boolean;

  @Column({ type: 'float', nullable: true })
  lastLat?: number;

  @Column({ type: 'float', nullable: true })
  lastLng?: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastLocationAt?: Date;
}
