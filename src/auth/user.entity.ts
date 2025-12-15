import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type UserRole = 'sender' | 'carrier';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Human-friendly sequential ID (unique). Assigned on first read/registration.
  @Column({ type: 'int', unique: true, nullable: true })
  publicId?: number;

  // FCM device token for push notifications (optional)
  @Column({ type: 'text', nullable: true })
  fcmToken?: string | null;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', default: 'sender' })
  role: UserRole;

  @Column({ nullable: true })
  fullName?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  vehicleType?: string;

  @Column({ nullable: true })
  vehiclePlate?: string;

  @Column({ nullable: true })
  serviceArea?: string;

  // Profil görselleri / istatistikler (opsiyonel)
  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ type: 'float', nullable: true })
  rating?: number;

  @Column({ type: 'int', nullable: true })
  deliveredCount?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}


