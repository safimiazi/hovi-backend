import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
  IsBoolean,
  Min,
  IsEmail,
} from 'class-validator';

class PaymentOrderItemDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsNumber()
  @Min(1)
  qty: number;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  variantLabel?: string;

  @IsOptional()
  @IsBoolean()
  isBundleItem?: boolean;

  @IsOptional()
  @IsString()
  bundleId?: string;
}

class PaymentShippingAddressDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  street: string;

  /** Division name */
  @IsString()
  city: string;

  /** District name */
  @IsOptional()
  @IsString()
  district?: string;

  /** Upazila/Thana name */
  @IsOptional()
  @IsString()
  upazila?: string;

  @IsString()
  postcode: string;

  /** @deprecated Use district + upazila. Kept for backward compatibility. */
  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateSslCommerzPaymentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentOrderItemDto)
  items: PaymentOrderItemDto[];

  @ValidateNested()
  @Type(() => PaymentShippingAddressDto)
  shippingAddress: PaymentShippingAddressDto;

  @IsOptional()
  @IsEnum(['standard', 'express'])
  deliveryMethod?: 'standard' | 'express';

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
