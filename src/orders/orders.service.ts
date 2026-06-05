import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus, ORDER_STATUS_TRANSITIONS } from '../common/constants/order-status.enum';
import { ProductsService } from '../products/products.service';
import { CouponsService } from '../coupons/coupons.service';
import { BundlesService } from '../bundles/bundles.service';
import { ShippingService } from '../shipping/shipping.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly productsService: ProductsService,
    private readonly couponsService: CouponsService,
    private readonly bundlesService: BundlesService,
    private readonly shippingService: ShippingService,
  ) {}

  /**
   * Generate a unique order number: HV-YYYYMMDD-XXXXX
   */
  private async generateOrderNumber(): Promise<string> {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `HV-${dateStr}-${random}`;
  }

  /**
   * Create a new order.
   * - Validates stock availability for all items
   * - Decrements stock atomically for each item
   * - If any item fails stock check, the order is rejected
   */
  async create(dto: CreateOrderDto, userId?: string, transactionId?: string): Promise<OrderDocument> {
    // Step 1: Validate stock for all items BEFORE decrementing
    for (const item of dto.items) {
      if (item.sku) {
        const stockCheck = await this.productsService.checkStock(item.productId, item.sku, item.qty);
        if (!stockCheck.available) {
          throw new BadRequestException(
            `Insufficient stock for "${item.name}". Available: ${stockCheck.currentStock}, Requested: ${item.qty}`,
          );
        }
      }
    }

    // Step 2: Validate pricing and prepare order items
    // Bundle items get price verified against the bundle document in DB
    const bundleCache = new Map<string, number>(); // bundleId → bundlePrice (cached)

    const validatedItems = await Promise.all(
      dto.items.map(async (item) => {
        // ── Bundle item: verify price against bundle record ──────────────────
        if (item.isBundleItem && item.bundleId) {
          // Fetch bundle price once per bundleId (cache to avoid N+1)
          if (!bundleCache.has(item.bundleId)) {
            try {
              const bundle = await this.bundlesService.findOne(item.bundleId);
              bundleCache.set(item.bundleId, bundle.bundlePrice);
            } catch {
              throw new BadRequestException(`Bundle "${item.bundleId}" not found`);
            }
          }
          const bundlePrice = bundleCache.get(item.bundleId)!;

          // The sum of all bundle item prices must equal the bundle price (allow ±1 for rounding)
          // We trust the proportional split done on frontend — just keep the price as-is
          // Security: ensure item.price is non-negative and reasonable (≤ bundlePrice)
          if (item.price < 0 || item.price > bundlePrice) {
            throw new BadRequestException(
              `Invalid bundle item price for "${item.name}". Must be between 0 and ৳${bundlePrice}`,
            );
          }

          return { ...item };
        }

        // ── Regular item: standard price validation ──────────────────────────
        const product = await this.productsService.findById(item.productId);
        const variant = item.sku
          ? (product.variants as any).find((v: any) => v.sku === item.sku)
          : undefined;

        if (item.sku && !variant) {
          throw new NotFoundException(`Variant with SKU "${item.sku}" not found for product "${item.name}"`);
        }

        const flashSalePrice: number | undefined = (product as any).flashSalePrice;
        const expectedPrice = flashSalePrice ?? (variant?.priceOverride ?? product.basePrice);

        if (item.price !== expectedPrice) {
          throw new BadRequestException(
            `Price mismatch for "${item.name}". Expected ৳${expectedPrice.toLocaleString()}, received ৳${item.price.toLocaleString()}`,
          );
        }

        return { ...item, price: expectedPrice };
      }),
    );

    // Step 3: Decrement stock for all items
    for (const item of validatedItems) {
      if (item.sku) {
        try {
          await this.productsService.decrementStock(item.productId, item.sku, item.qty);
          this.logger.log(`Stock decremented: ${item.name} (SKU: ${item.sku}) × ${item.qty}`);
        } catch (error: any) {
          throw new BadRequestException(
            `Failed to reserve stock for "${item.name}": ${error.message}`,
          );
        }
      }
    }

    // Step 4: Calculate totals
    const subtotal = validatedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shippingCost = await this.shippingService.calculateShipping(subtotal, dto.deliveryMethod as 'standard' | 'express');
    let discountAmount = 0;

    if (dto.couponCode) {
      const validationResult = await this.couponsService.validate(dto.couponCode, subtotal, {
        items: validatedItems.map((item) => ({
          productId: item.productId,
          sku: item.sku,
          qty: item.qty,
          price: item.price,
        })),
        userId,
        userEmail: dto.shippingAddress.email,
      });
      discountAmount = validationResult.calculatedDiscount;
    }

    const total = Math.max(0, subtotal + shippingCost - discountAmount);

    // Step 5: Create order
    const orderNumber = await this.generateOrderNumber();

    const order = new this.orderModel({
      userId: userId ? new Types.ObjectId(userId) : undefined,
      items: validatedItems.map((item) => ({
        ...item,
        productId: new Types.ObjectId(item.productId),
      })),
      shippingAddress: dto.shippingAddress,
      deliveryMethod: dto.deliveryMethod,
      paymentMethod: dto.paymentMethod,
      transactionId,
      couponCode: dto.couponCode?.trim().toUpperCase(),
      discountAmount,
      subtotal,
      shippingCost,
      total,
      status: OrderStatus.PENDING,
      orderNumber,
    });

    const savedOrder = await order.save();
    this.logger.log(`Order created: ${orderNumber} (Total: ৳${total})`);
    return savedOrder;
  }

  /**
   * Get all orders for a specific user.
   */
  async findByUser(userId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find an order by transaction ID — used on the payment result page.
   * Returns null if not found (don't throw, let controller handle).
   */
  async findByTransactionId(transactionId: string): Promise<OrderDocument | null> {
    return this.orderModel.findOne({ transactionId }).exec();
  }

  /**
   * Get a single order by ID. Validates ownership for non-admin users.
   */
  async findById(orderId: string, userId?: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) {
      throw new NotFoundException(`Order with id "${orderId}" not found`);
    }
    if (userId && order.userId?.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return order;
  }

  /**
   * Admin: Get all orders with pagination and optional status filter.
   */
  async findAll(
    page: number = 1,
    limit: number = 20,
    status?: OrderStatus,
  ): Promise<{ orders: OrderDocument[]; total: number; page: number; totalPages: number }> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return { orders, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Admin: Update order status with state machine validation.
   * 
   * Stock management:
   * - When order is CANCELLED → restore stock for all items
   * - Stock was already decremented at order creation time
   */
  async updateStatus(orderId: string, dto: UpdateOrderStatusDto): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) {
      throw new NotFoundException(`Order with id "${orderId}" not found`);
    }

    const currentStatus = order.status as OrderStatus;
    const allowedTransitions = ORDER_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from "${currentStatus}" to "${dto.status}". Allowed: ${allowedTransitions.join(', ') || 'none'}`,
      );
    }

    // If cancelling → restore stock
    if (dto.status === OrderStatus.CANCELLED) {
      await this.restoreOrderStock(order);
      this.logger.log(`Stock restored for cancelled order: ${order.orderNumber}`);
    }

    order.status = dto.status;
    if (dto.cancelReason) {
      order.cancelReason = dto.cancelReason;
    }

    const updatedOrder = await order.save();
    this.logger.log(`Order ${order.orderNumber} status: ${currentStatus} → ${dto.status}`);
    return updatedOrder;
  }

  /**
   * Mark a pending order paid after successful SSLCommerz validation.
   */
  async markOrderPaid(transactionId: string, validation: Record<string, any>): Promise<OrderDocument | null> {
    const order = await this.orderModel.findOne({ transactionId }).exec();
    if (!order) {
      return null;
    }

    if (order.status === OrderStatus.CANCELLED) {
      this.logger.warn(`Payment received for cancelled order ${order.orderNumber}`);
      return order;
    }

    order.status = OrderStatus.CONFIRMED;
    order.paymentVerified = true;
    order.paymentVerifiedAt = new Date();
    order.set('paymentValidation', validation);

    const updatedOrder = await order.save();
    this.logger.log(`Order payment confirmed: ${order.orderNumber} (transaction ${transactionId})`);
    return updatedOrder;
  }

  /**
   * Restore stock for all items in an order (used when cancelling).
   */
  private async restoreOrderStock(order: OrderDocument): Promise<void> {
    for (const item of order.items) {
      if (item.sku) {
        try {
          await this.productsService.restoreStock(
            item.productId.toString(),
            item.sku,
            item.qty,
          );
          this.logger.log(`Stock restored: ${item.name} (SKU: ${item.sku}) × ${item.qty}`);
        } catch (error: any) {
          this.logger.error(`Failed to restore stock for ${item.name}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Admin: Get order statistics.
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    confirmed: number;
    processing: number;
    shipped: number;
    delivered: number;
    cancelled: number;
    revenue: number;
  }> {
    const [total, pending, confirmed, processing, shipped, delivered, cancelled] = await Promise.all([
      this.orderModel.countDocuments().exec(),
      this.orderModel.countDocuments({ status: OrderStatus.PENDING }).exec(),
      this.orderModel.countDocuments({ status: OrderStatus.CONFIRMED }).exec(),
      this.orderModel.countDocuments({ status: OrderStatus.PROCESSING }).exec(),
      this.orderModel.countDocuments({ status: OrderStatus.SHIPPED }).exec(),
      this.orderModel.countDocuments({ status: OrderStatus.DELIVERED }).exec(),
      this.orderModel.countDocuments({ status: OrderStatus.CANCELLED }).exec(),
    ]);

    const revenueResult = await this.orderModel.aggregate([
      { $match: { status: { $in: [OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.PROCESSING, OrderStatus.CONFIRMED] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]).exec();

    const revenue = revenueResult[0]?.total || 0;

    return { total, pending, confirmed, processing, shipped, delivered, cancelled, revenue };
  }

  /**
   * Admin: Get revenue grouped by day for the last N days.
   */
  async getRevenueChart(days: number = 7): Promise<{ date: string; revenue: number; orders: number }[]> {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const result = await this.orderModel.aggregate([
      {
        $match: {
          createdAt: { $gte: since },
          status: { $in: [OrderStatus.DELIVERED, OrderStatus.SHIPPED, OrderStatus.PROCESSING, OrderStatus.CONFIRMED] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]).exec();

    // Build a full date range with 0s for missing days
    const map = new Map<string, { revenue: number; orders: number }>();
    for (const r of result) {
      const key = `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`;
      map.set(key, { revenue: r.revenue, orders: r.orders });
    }

    const output: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      output.push({ date: key, ...(map.get(key) ?? { revenue: 0, orders: 0 }) });
    }

    return output;
  }
}
