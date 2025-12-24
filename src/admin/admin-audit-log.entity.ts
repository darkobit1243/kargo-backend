import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  adminId: string;

  @Column()
  action: string;

  @Column({ type: 'json', nullable: true })
  details?: any;

  @CreateDateColumn()
  createdAt: Date;
}
