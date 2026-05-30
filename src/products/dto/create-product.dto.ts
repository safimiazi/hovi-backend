import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsMongoId,
  IsObject,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InlineVariantDto {
  @IsString()
  sku: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceOverride?: number;

  @IsNumber()
  @Min(0)
  stockQuantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  shortDescription: string;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsMongoId()
  categoryId: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  badge?: string;

  /**
   * Variants can be provided inline during product creation.
   * If not provided, a default variant with SKU based on product name will be created.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InlineVariantDto)
  variants?: InlineVariantDto[];

  /**
   * Shortcut: if no variants array is provided, use this as the stock for a default variant.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;
}
