import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ trim: true })
  title?: string;

  @Prop({ required: true })
  comment: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ default: false })
  isVerifiedPurchase: boolean;

  @Prop({ default: false })
  isApproved: boolean;

  @Prop({ default: 0 })
  helpfulCount: number;
}

export type ReviewDocument = Review & Document;

export const ReviewSchema = SchemaFactory.createForClass(Review);

// One review per user per product
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
// For fetching approved reviews for a product
ReviewSchema.index({ productId: 1, isApproved: 1, createdAt: -1 });
