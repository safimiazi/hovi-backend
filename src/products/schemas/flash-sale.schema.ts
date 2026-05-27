import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class FlashSaleItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  originalPrice: number;

  @Prop({ required: true, min: 0 })
  salePrice: number;
}

export const FlashSaleItemSchema = SchemaFactory.createForClass(FlashSaleItem);

@Schema({ timestamps: true, collection: 'flash_sales' })
export class FlashSale {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  endTime: Date;

  @Prop({ type: [FlashSaleItemSchema], required: true })
  products: FlashSaleItem[];

  @Prop({ default: true })
  isActive: boolean;
}

export type FlashSaleDocument = FlashSale & Document;

export const FlashSaleSchema = SchemaFactory.createForClass(FlashSale);

// Index for efficient active sale queries
FlashSaleSchema.index({ startTime: 1, endTime: 1, isActive: 1 });
// Index for checking product overlap in active sales
FlashSaleSchema.index({ 'products.productId': 1, startTime: 1, endTime: 1 });
