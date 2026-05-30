import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { User, UserDocument } from './schemas/user.schema';
import { RefreshToken, RefreshTokenDocument } from './schemas/refresh-token.schema';
import { Otp, OtpDocument, OtpPurpose } from './schemas/otp.schema';
import {
  RegisterDto,
  LoginDto,
  TokenResponseDto,
  OtpResponseDto,
  UpdateProfileDto,
  CreateAdminDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto';
import { UserRole } from '../common/constants/user-role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_SALT_ROUNDS = 12;
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly MAX_FAILED_LOGIN_ATTEMPTS = 5;
  private readonly ACCOUNT_LOCKOUT_DURATION_MINUTES = 30;
  private readonly OTP_EXPIRY_MINUTES: number;
  private readonly OTP_MAX_ATTEMPTS: number;
  private readonly OTP_RESEND_COOLDOWN_SECONDS: number;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(Otp.name)
    private readonly otpModel: Model<OtpDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.OTP_EXPIRY_MINUTES = this.configService.get<number>('OTP_EXPIRY_MINUTES', 5);
    this.OTP_MAX_ATTEMPTS = this.configService.get<number>('OTP_MAX_ATTEMPTS', 3);
    this.OTP_RESEND_COOLDOWN_SECONDS = this.configService.get<number>('OTP_RESEND_COOLDOWN_SECONDS', 60);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHONE OTP FLOW (Customer Default)
  // ─────────────────────────────────────────────────────────────────────────────

  async sendOtp(sendOtpDto: SendOtpDto): Promise<OtpResponseDto> {
    const { phone } = sendOtpDto;

    // Check cooldown — prevent OTP spam
    const recentOtp = await this.otpModel.findOne({
      identifier: phone,
      purpose: OtpPurpose.LOGIN,
      isUsed: false,
      createdAt: { $gte: new Date(Date.now() - this.OTP_RESEND_COOLDOWN_SECONDS * 1000) },
    });

    if (recentOtp) {
      throw new BadRequestException(
        `Please wait ${this.OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting a new OTP`,
      );
    }

    // Generate 6-digit OTP
    const otpCode = this.generateOtpCode();
    const hashedOtp = await bcrypt.hash(otpCode, 10);

    // Invalidate any existing unused OTPs for this phone
    await this.otpModel.updateMany(
      { identifier: phone, purpose: OtpPurpose.LOGIN, isUsed: false },
      { isUsed: true },
    );

    // Store new OTP
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);
    await this.otpModel.create({
      identifier: phone,
      code: hashedOtp,
      purpose: OtpPurpose.LOGIN,
      expiresAt,
    });

    // Send OTP via SMS
    await this.sendSms(phone, otpCode);

    const response: OtpResponseDto = {
      message: 'OTP sent successfully',
      expiresInSeconds: this.OTP_EXPIRY_MINUTES * 60,
    };

    // In development, include OTP in response for testing
    if (this.configService.get<string>('NODE_ENV') === 'development') {
      response.otp = otpCode;
    }

    return response;
  }

  async verifyOtpAndLogin(verifyOtpDto: VerifyOtpDto): Promise<TokenResponseDto> {
    const { phone, otp } = verifyOtpDto;

    // Find the latest unused OTP for this phone
    const storedOtp = await this.otpModel.findOne({
      identifier: phone,
      purpose: OtpPurpose.LOGIN,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!storedOtp) {
      throw new UnauthorizedException('OTP expired or not found. Please request a new one.');
    }

    // Check max attempts
    if (storedOtp.attempts >= this.OTP_MAX_ATTEMPTS) {
      storedOtp.isUsed = true;
      await storedOtp.save();
      throw new UnauthorizedException('Too many failed attempts. Please request a new OTP.');
    }

    // Verify OTP
    const isValid = await bcrypt.compare(otp, storedOtp.code);
    if (!isValid) {
      storedOtp.attempts += 1;
      await storedOtp.save();
      throw new UnauthorizedException('Invalid OTP');
    }

    // Mark OTP as used
    storedOtp.isUsed = true;
    await storedOtp.save();

    // Find or create user
    let user = await this.userModel.findOne({ phone });

    if (!user) {
      // Auto-register new customer on first OTP verification
      user = await this.userModel.create({
        name: `User ${phone.slice(-4)}`,
        phone,
        isPhoneVerified: true,
        role: UserRole.CUSTOMER,
      });
      this.logger.log(`New customer registered via phone: ${phone}`);
    } else {
      // Check if account is active
      if (!user.isActive) {
        throw new ForbiddenException('Account has been deactivated');
      }
      // Update phone verification status
      if (!user.isPhoneVerified) {
        user.isPhoneVerified = true;
      }
      user.lastLoginAt = new Date();
      await user.save();
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL + PASSWORD FLOW (Customer alternative & Admin)
  // ─────────────────────────────────────────────────────────────────────────────

  async register(registerDto: RegisterDto): Promise<TokenResponseDto> {
    const { name, email, password, phone } = registerDto;

    // Check for duplicate email
    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Check for duplicate phone if provided
    if (phone) {
      const existingPhone = await this.userModel.findOne({ phone });
      if (existingPhone) {
        throw new ConflictException('Phone number already registered');
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, this.BCRYPT_SALT_ROUNDS);

    // Create user
    const user = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      phone: phone || undefined,
      role: UserRole.CUSTOMER,
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
        phone: user.phone,
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
      const remainingMinutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account is temporarily locked. Try again in ${remainingMinutes} minutes.`,
      );
    }

    // Check if account is active
    if (!user.isActive) {
      throw new ForbiddenException('Account has been deactivated');
    }

    // Check if user has a password (phone-only users won't have one)
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses phone login. Please login with your phone number.',
      );
    }

    // Validate password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= this.MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockedUntil = new Date(
          Date.now() + this.ACCOUNT_LOCKOUT_DURATION_MINUTES * 60 * 1000,
        );
        this.logger.warn(`Account locked for user: ${email}`);
      }

      await user.save();
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset failed attempts on success
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
        phone: user.phone,
        role: user.role,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TOKEN MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async refreshTokens(refreshToken: string): Promise<TokenResponseDto> {
    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.refreshTokenModel.findOne({
      tokenHash,
      isRevoked: false,
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Token rotation — revoke old token
    storedToken.isRevoked = true;
    await storedToken.save();

    const user = await this.userModel.findById(storedToken.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    const tokens = await this.generateTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.refreshTokenModel.updateOne({ tokenHash }, { isRevoked: true });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokenModel.updateMany(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PROFILE MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

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
      phone: user.phone,
      role: user.role,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
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
      // Check if phone is already taken by another user
      const existingPhone = await this.userModel.findOne({
        phone: updateData.phone,
        _id: { $ne: userId },
      });
      if (existingPhone) {
        throw new ConflictException('Phone number already in use');
      }
      updateFields.phone = updateData.phone;
      updateFields.isPhoneVerified = false; // Require re-verification
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
      phone: user.phone,
      role: user.role,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      addresses: user.addresses,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async createAdmin(createAdminDto: CreateAdminDto) {
    const { name, email, password } = createAdminDto;

    const existingUser = await this.userModel.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, this.BCRYPT_SALT_ROUNDS);

    const admin = await this.userModel.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: UserRole.ADMIN,
      isEmailVerified: true,
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

    // Revoke all refresh tokens for this admin
    await this.logoutAll(adminId);

    return {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private async generateTokens(
    user: UserDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Generate cryptographically secure refresh token
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_EXPIRY_DAYS);

    await this.refreshTokenModel.create({
      userId: user._id,
      tokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private generateOtpCode(): string {
    // Cryptographically secure 6-digit OTP
    const buffer = crypto.randomBytes(4);
    const num = buffer.readUInt32BE(0);
    return String(num % 900000 + 100000);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async sendSms(phone: string, otp: string): Promise<void> {
    const provider = this.configService.get<string>('SMS_PROVIDER', 'console');

    if (provider === 'console') {
      // Development: log OTP to console
      this.logger.log(`📱 OTP for +880${phone}: ${otp}`);
      return;
    }

    // Production: integrate with SMS provider (MSG91, Twilio, etc.)
    // TODO: Implement actual SMS sending
    // Example with MSG91:
    // const apiKey = this.configService.get<string>('SMS_API_KEY');
    // await axios.post('https://api.msg91.com/api/v5/otp', { ... });

    this.logger.log(`SMS sent to +880${phone}`);
  }
}
