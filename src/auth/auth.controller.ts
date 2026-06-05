import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  TokenResponseDto,
  OtpResponseDto,
  UpdateProfileDto,
  CreateAdminDto,
  InternalTokenResponse,
} from './dto';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

/** Cookie name for the refresh token */
const REFRESH_COOKIE = 'petal_refresh_token';

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;
  private readonly cookieDomain: string | undefined;
  private readonly refreshTokenExpiryDays = 7;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    // Optional: scope cookie to root domain in production (e.g. ".petalbeauty.com")
    this.cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Strip the refreshToken from the service result and return a clean TokenResponseDto.
   */
  private toPublicResponse(result: InternalTokenResponse): TokenResponseDto {
    const { refreshToken: _rt, ...publicResponse } = result;
    return publicResponse;
  }

  /**
   * Set the refresh token as an HttpOnly, Secure, SameSite cookie.
   *
   * With the Next.js proxy in place (next.config.ts), all API calls go through
   * localhost:3000 → forwarded server-side to localhost:4000.
   * The cookie is set on the frontend origin so SameSite: 'lax' works fine in dev.
   *
   * In production, frontend and backend share the same domain, so 'strict' is safe.
   */
  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: this.isProduction ? 'strict' : 'lax',
      maxAge: this.refreshTokenExpiryDays * 24 * 60 * 60 * 1000,
      path: '/',
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    });
  }

  /** Clear the refresh token cookie on logout. */
  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: this.isProduction ? 'strict' : 'lax',
      path: '/',
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
    });
  }

  /**
   * Read refresh token — cookie takes priority over body fallback.
   * Body fallback is kept only for backward-compat with non-browser clients.
   */
  private extractRefreshToken(req: Request, dto?: RefreshTokenDto): string | null {
    return (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? dto?.refreshToken ?? null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHONE OTP ENDPOINTS (Customer Default)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Send OTP to phone number.
   * Rate limited: 3 requests per 5 minutes per IP.
   */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto): Promise<OtpResponseDto> {
    return this.authService.sendOtp(sendOtpDto);
  }

  /**
   * Verify OTP and login/register customer.
   * If user doesn't exist, auto-registers.
   * Rate limited: 5 requests per 5 minutes per IP.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.verifyOtpAndLogin(verifyOtpDto);
    this.setRefreshCookie(res, result.refreshToken);
    return this.toPublicResponse(result);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL + PASSWORD ENDPOINTS (Customer Alternative)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register customer with email + password.
   */
  @Public()
  @Post('register')
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.register(registerDto);
    this.setRefreshCookie(res, result.refreshToken);
    return this.toPublicResponse(result);
  }

  /**
   * Login customer with email + password.
   * Rate limited: 5 requests per 15 minutes per IP.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.login(loginDto);
    this.setRefreshCookie(res, result.refreshToken);
    return this.toPublicResponse(result);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Admin login — email + password only.
   * Validates that user has admin/super-admin role.
   * Rate limited: 5 requests per 15 minutes per IP.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.login(loginDto);

    if (
      result.user.role !== UserRole.ADMIN &&
      result.user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied. Admin privileges required.');
    }

    this.setRefreshCookie(res, result.refreshToken);
    return this.toPublicResponse(result);
  }

  /**
   * Create a new admin account (super-admin only).
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Post('admin/create')
  async createAdmin(@Body() createAdminDto: CreateAdminDto) {
    return this.authService.createAdmin(createAdminDto);
  }

  /**
   * Deactivate an admin account (super-admin only).
   */
  @Roles(UserRole.SUPER_ADMIN)
  @Put('admin/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateAdmin(@Param('id') id: string) {
    return this.authService.deactivateAdmin(id);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TOKEN MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Refresh access token.
   * Reads the refresh token from the HttpOnly cookie first; falls back to
   * request body for non-browser clients that cannot set cookies.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenResponseDto> {
    const refreshToken = this.extractRefreshToken(req, refreshTokenDto);
    if (!refreshToken) {
      throw new ForbiddenException('Refresh token not provided');
    }

    const result = await this.authService.refreshTokens(refreshToken);
    // Rotate: issue new cookie with rotated token
    this.setRefreshCookie(res, result.refreshToken);
    return this.toPublicResponse(result);
  }

  /**
   * Logout — revoke the refresh token and clear the cookie.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Body() refreshTokenDto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const refreshToken = this.extractRefreshToken(req, refreshTokenDto);
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    this.clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  }

  /**
   * Logout from all devices — revoke all refresh tokens and clear cookie.
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: { userId: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.logoutAll(user.userId);
    this.clearRefreshCookie(res);
    return { message: 'Logged out from all devices' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROFILE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current user profile.
   */
  @Get('me')
  async getProfile(@CurrentUser() user: { userId: string }) {
    return this.authService.getProfile(user.userId);
  }

  /**
   * Update current user profile.
   */
  @Put('me')
  async updateProfile(
    @CurrentUser() user: { userId: string },
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, updateProfileDto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FAVORITES
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current user's favorite product IDs.
   */
  @Get('me/favorites')
  async getFavorites(@CurrentUser() user: { userId: string }): Promise<{ favorites: string[] }> {
    const favorites = await this.authService.getFavorites(user.userId);
    return { favorites };
  }

  /**
   * Add a product to favorites.
   */
  @Post('me/favorites/:productId')
  @HttpCode(HttpStatus.OK)
  async addFavorite(
    @CurrentUser() user: { userId: string },
    @Param('productId') productId: string,
  ): Promise<{ favorites: string[] }> {
    const favorites = await this.authService.addFavorite(user.userId, productId);
    return { favorites };
  }

  /**
   * Remove a product from favorites.
   */
  @Delete('me/favorites/:productId')
  @HttpCode(HttpStatus.OK)
  async removeFavorite(
    @CurrentUser() user: { userId: string },
    @Param('productId') productId: string,
  ): Promise<{ favorites: string[] }> {
    const favorites = await this.authService.removeFavorite(user.userId, productId);
    return { favorites };
  }
}
