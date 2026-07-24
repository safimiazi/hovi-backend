import { IsString, IsNumber, IsOptional, IsArray, IsEnum, IsMongoId, IsEmail, IsBoolean, Min, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
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

  /** True for bundle items — price is pre-validated at bundle level, skip per-item price check */
  @IsOptional()
  @IsBoolean()
  isBundleItem?: boolean;

  @IsOptional()
  @IsString()
  bundleId?: string;
}

class ShippingAddressDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  street: string;

  /** Division name (e.g., "Dhaka", "Chattogram") */
  @IsString()
  city: string;

  /** District name (e.g., "Gazipur", "Dhaka") */
  @IsOptional()
  @IsString()
  district?: string;

  /** Upazila/Thana name (e.g., "Gazipur Sadar", "Dhamrai") */
  @IsOptional()
  @IsString()
  upazila?: string;

  @IsString()
  postcode: string;

  /** @deprecated Use district + upazila instead. Kept for backward compatibility. */
  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @IsEnum(['standard', 'express'])
  deliveryMethod: 'standard' | 'express';

  @IsEnum(['cod', 'bkash', 'nagad', 'sslcommerz'])
  paymentMethod: 'cod' | 'bkash' | 'nagad' | 'sslcommerz';

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}
