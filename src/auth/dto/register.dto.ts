import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Customer registration via email + password
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsString()
  @IsOptional()
  @Matches(/^01[3-9]\d{8}$/, { message: 'Phone must be a valid 11-digit Bangladeshi mobile number' })
  phone?: string;
}

/**
 * Customer registration/login via phone number (OTP flow)
 */
export class PhoneRegisterDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^01[3-9]\d{8}$/, { message: 'Phone must be a valid 11-digit Bangladeshi mobile number' })
  phone: string;

  @IsString()
  @IsOptional()
  name?: string;
}
