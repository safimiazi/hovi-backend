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
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto';
import { Public, Roles, CurrentUser } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ─── Public Endpoints ──────────────────────────────────────────────────────

  /**
   * Get reviews for a product (public, paginated).
   */
  @Public()
  @Get('product/:productId')
  findByProduct(
    @Param('productId') productId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewsService.findByProduct(productId, page || 1, limit || 10);
  }

  // ─── Authenticated Customer Endpoints ──────────────────────────────────────

  /**
   * Create a review (authenticated customer).
   */
  @Post()
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.userId, dto);
  }

  // ─── Admin Endpoints ───────────────────────────────────────────────────────

  /**
   * Admin: list all reviews with optional approval filter.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/all')
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('isApproved') isApproved?: string,
  ) {
    const approved =
      isApproved === 'true' ? true : isApproved === 'false' ? false : undefined;
    return this.reviewsService.findAll(page || 1, limit || 10, approved);
  }

  /**
   * Admin: approve a review.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put('admin/:id/approve')
  approve(@Param('id') id: string) {
    return this.reviewsService.approve(id);
  }

  /**
   * Admin: reject a review.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put('admin/:id/reject')
  reject(@Param('id') id: string) {
    return this.reviewsService.reject(id);
  }

  /**
   * Admin: delete a review.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete('admin/:id')
  delete(@Param('id') id: string) {
    return this.reviewsService.delete(id);
  }
}
