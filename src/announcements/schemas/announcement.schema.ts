import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Announcement {
  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  priority: number;

  @Prop()
  startsAt?: Date;

  @Prop()
  endsAt?: Date;
}

export type AnnouncementDocument = Announcement & Document;
export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);
