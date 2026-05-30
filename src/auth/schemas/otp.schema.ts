import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum OtpPurpose {
  LOGIN = 'login',
  REGISTER = 'register',
  RESET_PASSWORD = 'reset-password',
  VERIFY_PHONE = 'verify-phone',
  VERIFY_EMAIL = 'verify-email',
}

@Schema({ timestamps: true, collection: 'otps' })
export class Otp {
  @Prop({ required: true, index: true })
  identifier: string; // phone number or email

  @Prop({ required: true })
  code: string; // hashed OTP

  @Prop({ required: true, enum: Object.values(OtpPurpose) })
  purpose: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ default: false })
  isUsed: boolean;

  @Prop()
  ipAddress?: string;
}

export type OtpDocument = Otp & Document;
export const OtpSchema = SchemaFactory.createForClass(Otp);

// TTL index — auto-delete expired OTPs after 10 minutes
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });
// Compound index for lookup
OtpSchema.index({ identifier: 1, purpose: 1, isUsed: 1 });
