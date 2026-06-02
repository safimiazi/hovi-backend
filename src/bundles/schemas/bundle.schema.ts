import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'bundles' })
export class Bundle {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ trim: true })
  badge?: string; // e.g. "Limited Edition", "Best Value"

  @Prop({ trim: true })
  emoji?: string; // e.g. "🎀", "🌸"

  @Prop({ required: true, min: 0 })
  bundlePrice: number;

  @Prop({ min: 0 })
  originalPrice?: number; // sum of individual prices for display

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Product' }], default: [] })
  productIds: Types.ObjectId[];

  @Prop({ default: false })
  isActive: boolean;
}

export type BundleDocument = Bundle & Document;
export const BundleSchema = SchemaFactory.createForClass(Bundle);

// Only one active bundle at a time is enforced in the service layer
BundleSchema.index({ isActive: 1 });
