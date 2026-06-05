export class TokenUserDto {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
}

/**
 * Returned over HTTP by the controller.
 * refreshToken is NOT included — it is set as an HttpOnly cookie by the controller.
 */
export class TokenResponseDto {
  accessToken: string;
  user: TokenUserDto;
}

/**
 * Internal service return type — includes the raw refreshToken so the controller
 * can set it as an HttpOnly cookie before stripping it from the response body.
 */
export class InternalTokenResponse {
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
