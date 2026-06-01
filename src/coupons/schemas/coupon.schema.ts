import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
}

@Schema({ timestamps: true, collection: 'coupons' })
export class Coupon {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop()
  description?: string;

  @Prop({ required: true, enum: DiscountType })
  discountType: DiscountType;

  @Prop({ required: true, min: 0 })
  discountValue: number;

  @Prop({ default: 0 })
  minimumOrderAmount: number;

  @Prop()
  maximumDiscount?: number;

  @Prop()
  usageLimit?: number;

  @Prop({ default: 0 })
  usedCount: number;

  @Prop()
  perUserLimit?: number;

  @Prop({ required: true })
  validFrom: Date;

  @Prop({ required: true })
  validUntil: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [Types.ObjectId], ref: 'Product', default: [] })
  applicableProducts: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: 'Category', default: [] })
  applicableCategories: Types.ObjectId[];
}

export type CouponDocument = Coupon & Document;

export const CouponSchema = SchemaFactory.createForClass(Coupon);

// Unique index on code
CouponSchema.index({ code: 1 }, { unique: true });
// For finding active coupons within date range
CouponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });
