import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
} from './dto';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<TokenResponseDto> {
    return this.authService.verifyOtpAndLogin(verifyOtpDto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL + PASSWORD ENDPOINTS (Customer Alternative)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Register customer with email + password.
   */
  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto): Promise<TokenResponseDto> {
    return this.authService.register(registerDto);
  }

  /**
   * Login customer with email + password.
   * Rate limited: 5 requests per 15 minutes per IP.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(loginDto);
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
  async adminLogin(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    const result = await this.authService.login(loginDto);

    if (
      result.user.role !== UserRole.ADMIN &&
      result.user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied. Admin privileges required.');
    }

    return result;
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
   * Refresh access token using refresh token.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  /**
   * Logout — revoke the provided refresh token.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() refreshTokenDto: RefreshTokenDto): Promise<{ message: string }> {
    await this.authService.logout(refreshTokenDto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  /**
   * Logout from all devices — revoke all refresh tokens.
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: { userId: string },
  ): Promise<{ message: string }> {
    await this.authService.logoutAll(user.userId);
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
}
