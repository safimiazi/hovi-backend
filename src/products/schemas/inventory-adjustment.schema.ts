import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'inventory_adjustments' })
export class InventoryAdjustment {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product', index: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  variantSku: string;

  @Prop({ required: true })
  previousQuantity: number;

  @Prop({ required: true })
  newQuantity: number;

  @Prop({ required: true })
  adjustmentAmount: number;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  adjustedBy: Types.ObjectId;
}

export type InventoryAdjustmentDocument = InventoryAdjustment & Document;

export const InventoryAdjustmentSchema =
  SchemaFactory.createForClass(InventoryAdjustment);
