import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsObject,
  Min,
} from 'class-validator';

export class CreateVariantDto {
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
