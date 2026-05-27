import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { User, UserDocument } from './schemas/user.schema';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';
import { RegisterDto, LoginDto, TokenResponseDto, UpdateProfileDto, CreateAdminDto } from './dto';
import { UserRole } from '../common/constants/user-role.enum';

@Injectable()
export class AuthService {
  private readonly BCRYPT_SALT_ROUNDS = 12;
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly MAX_FAILED_LOGIN_ATTEMPTS = 5;
  private readonly ACCOUNT_LOCKOUT_DURATION_MINUTES = 30;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<TokenResponseDto> {
    const { name, email, password } = registerDto;

    // Check for duplicate email
    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password with bcrypt (12 rounds)
    const passwordHash = await bcrypt.hash(password, this.BCRYPT_SALT_ROUNDS);

    // Create user
    const user = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<TokenResponseDto> {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Account is temporarily locked due to too many failed login attempts. Please try again later.',
      );
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ForbiddenException('Account has been deactivated');
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      // Increment failed login attempts
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      // Lock account if max attempts exceeded
      if (user.failedLoginAttempts >= this.MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(
          Date.now() + this.ACCOUNT_LOCKOUT_DURATION_MINUTES * 60 * 1000,
        );
      }

      await user.save();
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed login attempts on successful login
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refreshTokens(refreshToken: string): Promise<TokenResponseDto> {
    // Hash the provided refresh token to compare with stored hash
    const tokenHash = this.hashToken(refreshToken);

    // Find the stored refresh token
    const storedToken = await this.refreshTokenModel.findOne({
      tokenHash,
      isRevoked: false,
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check expiry
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Invalidate the old token (rotation)
    storedToken.isRevoked = true;
    await storedToken.save();

    // Find the user
    const user = await this.userModel.findById(storedToken.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Issue new token pair
    const tokens = await this.generateTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    // Revoke the refresh token
    await this.refreshTokenModel.updateOne(
      { tokenHash },
      { isRevoked: true },
    );
  }

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash')
      .lean();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      isActive: user.isActive,
      addresses: user.addresses,
      createdAt: (user as any).createdAt,
    };
  }

  async updateProfile(userId: string, updateData: UpdateProfileDto) {
    const updateFields: Record<string, any> = {};
    if (updateData.name !== undefined) {
      updateFields.name = updateData.name;
    }
    if (updateData.phone !== undefined) {
      updateFields.phone = updateData.phone;
    }

    const user = await this.userModel
      .findByIdAndUpdate(userId, { $set: updateFields }, { new: true })
      .select('-passwordHash')
      .lean();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      isActive: user.isActive,
      addresses: user.addresses,
    };
  }

  async createAdmin(createAdminDto: CreateAdminDto) {
    const { name, email, password } = createAdminDto;

    // Check for duplicate email
    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.BCRYPT_SALT_ROUNDS);

    // Create admin user
    const admin = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: UserRole.ADMIN,
    });

    return {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
    };
  }

  async deactivateAdmin(adminId: string) {
    const admin = await this.userModel.findById(adminId);

    if (!admin) {
      throw new NotFoundException('Admin account not found');
    }

    if (admin.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot deactivate a super-admin account');
    }

    if (admin.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Target account is not an admin');
    }

    admin.isActive = false;
    await admin.save();

    return {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
    };
  }

  private async generateTokens(
    user: UserDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Generate JWT with user ID, email, and role
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token (random crypto string)
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    // Store hashed refresh token in DB
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
