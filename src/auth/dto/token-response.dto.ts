export class TokenUserDto {
  id: string;
  name: string;
  email: string;
  role: string;
}

export class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  user: TokenUserDto;
}
