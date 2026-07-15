import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Email + password login (admin & customer)
 */
export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

/**
 * Phone-only login (no OTP) — temporary until OTP SMS is set up.
 * Finds or creates a customer by phone number.
 */
export class PhoneLoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^01[3-9]\d{8}$/, { message: 'Phone must be a valid 11-digit Bangladeshi mobile number' })
  phone: string;
}

/**
 * Send OTP to phone number (customer default login)
 */
export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^01[3-9]\d{8}$/, { message: 'Phone must be a valid 11-digit Bangladeshi mobile number' })
  phone: string;
}

/**
 * Verify OTP and login/register (customer)
 */
export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^01[3-9]\d{8}$/, { message: 'Phone must be a valid 11-digit Bangladeshi mobile number' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit number' })
  otp: string;
}
