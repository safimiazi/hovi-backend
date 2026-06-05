import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
   * Look up an order by transaction ID — used on the payment result page.
   * Requires the customer's phone number to verify ownership.
   * Rate-limited to prevent enumeration / brute-force attacks.
   *
   * Security model:
   *  - Transaction IDs are UUIDs (unguessable)
   *  - Phone check adds a second factor: even if someone guesses the tran_id,
   *    they still need the exact phone number used at checkout
   *  - 10 requests per minute per IP to prevent brute-forcing phone numbers
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('by-transaction/:transactionId')
  async getByTransactionId(
    @Param('transactionId') transactionId: string,
    @Query('phone') phone: string,
  ) {
    if (!phone || phone.trim().length < 10) {
      throw new BadRequestException('phone query parameter is required');
    }

    const order = await this.ordersService.findByTransactionId(transactionId);

    if (!order) {
      // Return 404 regardless of reason — don't reveal whether tran_id exists
      throw new NotFoundException('Order not found');
    }

    // Verify phone matches — strip non-digits for flexible matching
    const normalize = (p: string) => p.replace(/\D/g, '');
    const orderPhone = normalize(order.shippingAddress.phone);
    const requestPhone = normalize(phone);

    if (!orderPhone || !orderPhone.endsWith(requestPhone) && !requestPhone.endsWith(orderPhone)) {
      // Same 404 — don't leak that tran_id exists but phone was wrong
      throw new NotFoundException('Order not found');
    }

    return order;
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
   * Admin: Get revenue grouped by day for the last N days.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/revenue-chart')
  async getRevenueChart(@Query('days') days?: number) {
    return this.ordersService.getRevenueChart(days || 7);
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
