export class TokenUserDto {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
}

export class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  user: TokenUserDto;
}

export class OtpResponseDto {
  message: string;
  expiresInSeconds: number;
  /** Only included in development mode for testing */
  otp?: string;
}
