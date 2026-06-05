import { IsOptional, IsString } from 'class-validator';

/**
 * refreshToken is optional in the body — the preferred path is via HttpOnly cookie.
 * This DTO is kept for any legacy clients that still send the token in the body.
 */
export class RefreshTokenDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}
