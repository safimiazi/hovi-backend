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

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly productsService: ProductsService,
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
  async create(dto: CreateOrderDto, userId?: string): Promise<OrderDocument> {
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

    // Step 2: Decrement stock for all items
    for (const item of dto.items) {
      if (item.sku) {
        try {
          await this.productsService.decrementStock(item.productId, item.sku, item.qty);
          this.logger.log(`Stock decremented: ${item.name} (SKU: ${item.sku}) × ${item.qty}`);
        } catch (error: any) {
          // If decrement fails (race condition), throw error
          throw new BadRequestException(
            `Failed to reserve stock for "${item.name}": ${error.message}`,
          );
        }
      }
    }

    // Step 3: Calculate totals
    const subtotal = dto.items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shippingCost = dto.deliveryMethod === 'express' ? 120 : (subtotal >= 999 ? 0 : 60);
    const total = subtotal + shippingCost;

    // Step 4: Create order
    const orderNumber = await this.generateOrderNumber();

    const order = new this.orderModel({
      userId: userId ? new Types.ObjectId(userId) : undefined,
      items: dto.items.map((item) => ({
        ...item,
        productId: new Types.ObjectId(item.productId),
      })),
      shippingAddress: dto.shippingAddress,
      deliveryMethod: dto.deliveryMethod,
      paymentMethod: dto.paymentMethod,
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
}
