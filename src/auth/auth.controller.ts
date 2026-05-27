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
  RefreshTokenDto,
  TokenResponseDto,
  UpdateProfileDto,
  CreateAdminDto,
} from './dto';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() registerDto: RegisterDto): Promise<TokenResponseDto> {
    return this.authService.register(registerDto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() loginDto: LoginDto): Promise<TokenResponseDto> {
    const result = await this.authService.login(loginDto);

    // Validate that the user has admin or super-admin role
    if (
      result.user.role !== UserRole.ADMIN &&
      result.user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Access denied. Admin privileges required.');
    }

    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<TokenResponseDto> {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Body() refreshTokenDto: RefreshTokenDto): Promise<{ message: string }> {
    await this.authService.logout(refreshTokenDto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  async getProfile(@CurrentUser() user: { userId: string; email: string; role: string }) {
    return this.authService.getProfile(user.userId);
  }

  @Put('me')
  async updateProfile(
    @CurrentUser() user: { userId: string; email: string; role: string },
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.userId, updateProfileDto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post('admin/create')
  async createAdmin(@Body() createAdminDto: CreateAdminDto) {
    return this.authService.createAdmin(createAdminDto);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Put('admin/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateAdmin(@Param('id') id: string) {
    return this.authService.deactivateAdmin(id);
  }
}
