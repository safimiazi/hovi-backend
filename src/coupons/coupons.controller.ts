import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './dto';
import { Public, Roles, CurrentUser } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  // ─── Public/Authenticated Endpoints ────────────────────────────────────────

  /**
   * Validate a coupon code and return the discount amount.
   */
  @Public()
  @Post('validate')
  validate(@Body() dto: ValidateCouponDto, @CurrentUser() user?: { userId: string }) {
    return this.couponsService.validate(dto.code, dto.orderAmount, {
      items: dto.items,
      userId: user?.userId,
      userEmail: dto.userEmail,
    });
  }

  @Public()
  @Get('active')
  findActive() {
    return this.couponsService.findActive();
  }

  // ─── Admin Endpoints ───────────────────────────────────────────────────────

  /**
   * Admin: list all coupons.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get()
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.couponsService.findAll(page || 1, limit || 10);
  }

  /**
   * Admin: create a coupon.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }

  /**
   * Admin: update a coupon.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.couponsService.update(id, dto);
  }

  /**
   * Admin: deactivate a coupon (soft delete).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.couponsService.deactivate(id);
  }
}
