import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'sender' | 'carrier' | 'admin';

@Entity({ name: 'users' })
@Index(['role'])
@Index(['role', 'isVerified'])
@Index(['isActive'])
@Index(['createdAt'])
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

  // Password reset (6-digit code, stored hashed)
  @Column({ type: 'text', nullable: true })
  passwordResetCodeHash?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiresAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetUsedAt?: Date | null;

  @Column({ type: 'varchar', default: 'sender' })
  role: UserRole;

  @Column({ type: 'text', nullable: true })
  fullName?: string | null;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  // Sender company info (required for sender onboarding)
  @Column({ type: 'text', nullable: true })
  companyName?: string | null;

  @Column({ type: 'text', nullable: true })
  taxNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  taxOffice?: string | null;

  @Column({ type: 'text', nullable: true })
  cityId?: string | null;

  @Column({ type: 'text', nullable: true })
  districtId?: string | null;

  @Column({ type: 'text', nullable: true })
  city?: string | null;

  @Column({ type: 'text', nullable: true })
  district?: string | null;

  @Column({ type: 'text', nullable: true })
  activityArea?: string | null;

  @Column({ type: 'text', nullable: true })
  vehicleType?: string | null;

  @Column({ type: 'text', nullable: true })
  vehiclePlate?: string | null;

  @Column({ type: 'text', nullable: true })
  serviceArea?: string | null;

  // Profil görselleri / istatistikler (opsiyonel)
  @Column({ type: 'text', nullable: true })
  avatarUrl?: string | null;

  @Column({ type: 'float', nullable: true })
  rating?: number;

  @Column({ type: 'int', nullable: true })
  deliveredCount?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
