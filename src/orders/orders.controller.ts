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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Types } from 'mongoose';
import { OrdersService } from './orders.service';
import { CreateOrderDto, CreateCodOrderDto, UpdateOrderStatusDto } from './dto';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';
import { OrderStatus } from '../common/constants/order-status.enum';
import { PathaoService } from '../pathao/pathao.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly pathaoService: PathaoService,
  ) {}

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
   * Place a COD order. No authentication required; payment is due on delivery.
   */
  @Public()
  @Post('cod')
  @HttpCode(HttpStatus.CREATED)
  async createCod(
    @Body() dto: CreateCodOrderDto,
    @CurrentUser() user?: { userId: string },
  ) {
    return this.ordersService.createCodOrder(dto, user?.userId);
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
   * Admin: Get all orders with pagination and optional status/paymentMethod filter.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/all')
  async getAllOrders(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: OrderStatus,
    @Query('paymentMethod') paymentMethod?: string,
  ) {
    return this.ordersService.findAll(page || 1, limit || 20, status, paymentMethod);
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
    const updated = await this.ordersService.updateStatus(id, dto);
    // Auto-cancel on Pathao if order was cancelled and had a consignment (fire-and-forget)
    if (dto.status === 'cancelled' && updated.pathaoConsignmentId) {
      this.pathaoService.cancelConsignment(updated.pathaoConsignmentId).catch(() => {});
    }
    return updated;
  }

  /**
   * Admin: Mark a COD order's payment as collected.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put('admin/:id/cod-payment')
  async markCodPaymentCollected(@Param('id') id: string) {
    return this.ordersService.markCodPaymentCollected(id);
  }

  /**
   * Admin: Push an order to Pathao Courier as a consignment.
   * Creates a Pathao shipment and saves the consignment_id on the order.
   * Re-pushing overwrites the existing consignment_id.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/:id/pathao-push')
  async pathoPush(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order ID format');
    }
    const order = await this.ordersService.findById(id);
    const consignmentId = await this.pathaoService.pushConsignment(order);
    order.pathaoConsignmentId = consignmentId;
    return order.save();
  }

  /**
   * Admin: Check Pathao delivery status for an order.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/:id/pathao-status')
  async getPathaoStatus(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order ID format');
    }
    const order = await this.ordersService.findById(id);
    if (!order.pathaoConsignmentId) {
      throw new BadRequestException('Order has not been pushed to Pathao yet');
    }
    const pathaoData = await this.pathaoService.getConsignmentStatus(order.pathaoConsignmentId);
    const deliveryStatus = (pathaoData as any)?.order_status ?? (pathaoData as any)?.status ?? null;
    if (deliveryStatus) {
      (order as any).pathaoStatus = deliveryStatus;
      await (order as any).save();
    }
    return { order, pathaoData };
  }

  /**
   * Admin: Calculate Pathao delivery charge.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/pathao-price')
  async calculatePathaoPrice(
    @Body() body: { itemType?: number; deliveryType?: number; itemWeight?: number; recipientCity?: number; recipientZone?: number },
  ) {
    return this.pathaoService.calculateDeliveryCharge(body);
  }

  /**
   * Admin: Get Pathao cities list.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/pathao-cities')
  async getPathaoCities() {
    return this.pathaoService.getCities();
  }

  /**
   * Admin: Get Pathao zones for a city.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/pathao-zones/:cityId')
  async getPathaoZones(@Param('cityId') cityId: string) {
    const id = parseInt(cityId, 10);
    if (isNaN(id)) throw new BadRequestException('Invalid city ID');
    return this.pathaoService.getZones(id);
  }

  /**
   * Public: Pathao webhook — receives delivery status updates.
   * Stores pathaoStatus on the order. Does NOT auto-update order.status.
   */
  @Public()
  @Post('pathao-webhook')
  @HttpCode(HttpStatus.OK)
  async pathaoWebhook(@Body() body: any) {
    const consignmentId = body?.consignment_id ?? body?.consignmentId;
    const pathaoStatus  = body?.order_status ?? body?.orderStatus ?? body?.status;
    const merchantOrderId = body?.merchant_order_id ?? body?.merchantOrderId;
    await this.ordersService.updatePathaoStatus(consignmentId, merchantOrderId, pathaoStatus);
    return { received: true };
  }

  // ─── Customer: Get specific order (MUST be last — :id is a wildcard) ───────

  /**
   * Look up a COD order by order number — used on the COD confirmation page.
   * Requires the customer's phone number to verify ownership.
   * Rate-limited to prevent enumeration / brute-force attacks.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('by-order-number/:orderNumber')
  async getByOrderNumber(
    @Param('orderNumber') orderNumber: string,
    @Query('phone') phone: string,
  ) {
    if (!phone || phone.trim().length < 10) {
      throw new BadRequestException('phone query parameter is required (min 10 chars)');
    }

    const order = await this.ordersService.findByOrderNumber(orderNumber, phone);

    if (!order) {
      // Return 404 regardless of reason — don't reveal whether orderNumber exists
      throw new NotFoundException('Order not found');
    }

    return order;
  }

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
