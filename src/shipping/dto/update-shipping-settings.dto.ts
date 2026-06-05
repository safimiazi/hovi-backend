import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateShippingSettingsDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  standardCost?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  expressCost?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  freeShippingThreshold?: number;

  @IsBoolean()
  @IsOptional()
  freeShippingEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  expressEnabled?: boolean;

  @IsString()
  @IsOptional()
  standardLabel?: string;

  @IsString()
  @IsOptional()
  expressLabel?: string;
}
