import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';
import { OrderStatus } from '../common/constants/order-status.enum';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  // ─── Customer Endpoints ────────────────────────────────────────────────────

  /**
   * Place a new order. Works for both authenticated and guest users.
   */
  @Public()
  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user?: { userId: string },
  ) {
    return this.ordersService.create(dto, user?.userId);
  }

  /**
   * Get current user's orders.
   */
  @Get('my')
  async getMyOrders(@CurrentUser() user: { userId: string }) {
    return this.ordersService.findByUser(user.userId);
  }

  // ─── Admin Endpoints (MUST be before :id to avoid route conflict) ──────────

  /**
   * Admin: Get all orders with pagination and optional status filter.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/all')
  async getAllOrders(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findAll(page || 1, limit || 20, status);
  }

  /**
   * Admin: Get order statistics.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/stats')
  async getStats() {
    return this.ordersService.getStats();
  }

  /**
   * Admin: Get a specific order (no ownership check).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/:id')
  async getOrderAdmin(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  /**
   * Admin: Update order status.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put('admin/:id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }

  // ─── Customer: Get specific order (MUST be last — :id is a wildcard) ───────

  /**
   * Get a specific order (validates ownership).
   */
  @Get(':id')
  async getOrder(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.ordersService.findById(id, user.userId);
  }
}
