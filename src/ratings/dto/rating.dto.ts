export class RatingDto {
  id: string;
  fromUserId: string;
  toUserId: string;
  deliveryId: string;
  score: number;
  comment?: string;
}
