import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBundleDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsNumber()
  @Min(0)
  bundlePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsArray()
  @IsString({ each: true })
  productIds: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
