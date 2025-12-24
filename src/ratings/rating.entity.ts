import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'ratings' })
@Index(['deliveryId', 'fromUserId'], { unique: true })
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fromUserId: string;

  @Column()
  toUserId: string;

  @Column()
  deliveryId: string;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @CreateDateColumn()
  createdAt: Date;
}
