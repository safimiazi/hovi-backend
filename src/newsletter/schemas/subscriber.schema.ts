import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'newsletter_subscribers' })
export class Subscriber {
  @Prop({
    required: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  source?: string; // e.g. 'homepage', 'footer'
}

export type SubscriberDocument = Subscriber & Document;
export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);

// Unique sparse index — prevents duplicate subscriptions efficiently
SubscriberSchema.index({ email: 1 }, { unique: true });
SubscriberSchema.index({ isActive: 1, createdAt: -1 });
