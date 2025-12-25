import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'admin_audit_logs' })
@Index(['createdAt'])
@Index(['adminId', 'createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adminId: string;

  @Column()
  action: string;

  @Column({ type: 'varchar', nullable: true })
  ip?: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent?: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetType?: string | null;

  @Column({ type: 'varchar', nullable: true })
  targetId?: string | null;

  @Column({ type: 'json', nullable: true })
  details?: any;

  @CreateDateColumn()
  createdAt: Date;
}
