import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OrderStatus } from '../../common/constants/order-status.enum';

@Schema()
export class OrderItem {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;

  @Prop()
  variantId?: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  image?: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, min: 1 })
  qty: number;

  @Prop()
  sku?: string;

  @Prop()
  variantLabel?: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema()
export class ShippingAddress {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  street: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  postcode: string;

  @Prop()
  area?: string;

  @Prop()
  note?: string;
}

export const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  @Prop({ type: ShippingAddressSchema, required: true })
  shippingAddress: ShippingAddress;

  @Prop({ required: true, enum: ['standard', 'express'], default: 'standard' })
  deliveryMethod: string;

  @Prop({ required: true, enum: ['cod', 'bkash', 'nagad', 'sslcommerz'], default: 'cod' })
  paymentMethod: string;

  @Prop({ unique: true, sparse: true })
  transactionId?: string;

  @Prop({ default: false })
  paymentVerified?: boolean;

  @Prop()
  paymentVerifiedAt?: Date;

  @Prop({ type: Object })
  paymentValidation?: Record<string, unknown>;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0 })
  shippingCost: number;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ required: true, enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Prop()
  cancelReason?: string;

  @Prop({ unique: true })
  orderNumber: string;
}

export type OrderDocument = Order & Document;

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ orderNumber: 1 }, { unique: true });
