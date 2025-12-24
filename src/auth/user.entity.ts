import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'sender' | 'carrier' | 'admin';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ... (existing columns)

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  // Human-friendly sequential ID (unique). Assigned on first read/registration.
  @Column({ type: 'int', unique: true, nullable: true })
  publicId?: number;

  // FCM device token for push notifications (optional)
  @Column({ type: 'text', nullable: true })
  fcmToken?: string | null;

  // JWT refresh token (opsiyonel)
  @Column({ type: 'text', nullable: true })
  refreshToken?: string | null;

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

  // Sender company info (required for sender onboarding)
  @Column({ nullable: true })
  companyName?: string;

  @Column({ nullable: true })
  taxNumber?: string;

  @Column({ nullable: true })
  taxOffice?: string;

  @Column({ nullable: true })
  cityId?: string;

  @Column({ nullable: true })
  districtId?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  district?: string;

  @Column({ nullable: true })
  activityArea?: string;

  @Column({ nullable: true })
  vehicleType?: string;

  @Column({ nullable: true })
  vehiclePlate?: string;

  @Column({ nullable: true })
  serviceArea?: string;

  // Profil görselleri / istatistikler (opsiyonel)
  @Column({ type: 'text', nullable: true })
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
