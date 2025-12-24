import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'messages' })
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  listingId: string;

  @Column()
  senderId: string;

  @Column()
  carrierId: string;

  @Column()
  content: string;

  @Column({ default: false })
  fromCarrier: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
