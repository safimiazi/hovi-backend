import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class Variant {
  @Prop({ required: true })
  sku: string;

  @Prop({ type: Map, of: String })
  attributes: Map<string, string>;

  @Prop()
  priceOverride?: number;

  @Prop({ required: true, min: 0 })
  stockQuantity: number;

  @Prop({ default: 10 })
  lowStockThreshold: number;

  @Prop({ type: [String] })
  images?: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const VariantSchema = SchemaFactory.createForClass(Variant);

@Schema({ timestamps: true, collection: 'products' })
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  shortDescription: string;

  @Prop({ required: true, min: 0 })
  basePrice: number;

  @Prop({ min: 0 })
  originalPrice?: number;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Category', index: true })
  categoryId: Types.ObjectId;

  @Prop({ type: [String] })
  images: string[];

  @Prop({ type: [VariantSchema] })
  variants: Variant[];

  @Prop({ type: String })
  badge?: string;

  @Prop({ default: 0 })
  averageRating: number;

  @Prop({ default: 0 })
  reviewCount: number;

  @Prop({ default: 0 })
  salesCount: number;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: String, index: 'text' })
  searchText: string;
}

export type ProductDocument = Product & Document;

export const ProductSchema = SchemaFactory.createForClass(Product);

// Compound indexes for efficient filtering and sorting
ProductSchema.index({ categoryId: 1, basePrice: 1 });
ProductSchema.index({ categoryId: 1, averageRating: -1 });
ProductSchema.index({ categoryId: 1, salesCount: -1 });
