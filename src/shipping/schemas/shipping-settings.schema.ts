import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'shipping_settings' })
export class ShippingSettings {
  @Prop({ required: true, default: 99, min: 0 })
  standardCost: number;

  @Prop({ required: true, default: 120, min: 0 })
  expressCost: number;

  @Prop({ required: true, default: 999, min: 0 })
  freeShippingThreshold: number;

  @Prop({ required: true, default: true })
  freeShippingEnabled: boolean;

  @Prop({ required: true, default: true })
  expressEnabled: boolean;

  @Prop({ default: 'Standard Delivery (3-5 days)' })
  standardLabel: string;

  @Prop({ default: 'Express Delivery (1-2 days)' })
  expressLabel: string;
}

export type ShippingSettingsDocument = ShippingSettings & Document;
export const ShippingSettingsSchema = SchemaFactory.createForClass(ShippingSettings);
