import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @Matches(/^01[3-9]\d{8}$/, { message: 'Phone must be a valid 11-digit Bangladeshi mobile number' })
  phone?: string;
}
