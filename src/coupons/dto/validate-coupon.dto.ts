import { IsString, IsNumber, Min, IsOptional, IsArray, IsMongoId, ValidateNested, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

class CouponItemDto {
  @IsString()
  @IsMongoId()
  productId: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Min(1)
  qty: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class ValidateCouponDto {
  @IsString()
  code: string;

  @IsNumber()
  @Min(0)
  orderAmount: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CouponItemDto)
  items?: CouponItemDto[];

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsEmail()
  userEmail?: string;
}
