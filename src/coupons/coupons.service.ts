import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Coupon, CouponDocument, DiscountType } from './schemas/coupon.schema';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { ProductsService } from '../products/products.service';

@Injectable()
export class CouponsService {
  constructor(
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly productsService: ProductsService,
  ) {}

  /**
   * Validate a coupon code and return the calculated discount.
   */
  async validate(
    code: string,
    orderAmount: number,
    options?: {
      items?: Array<{ productId: string; sku?: string; qty: number; price: number }>;
      userId?: string;
      userEmail?: string;
    },
  ) {
    const coupon = await this.couponModel
      .findOne({ code: code.toUpperCase() })
      .exec();

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    if (!coupon.isActive) {
      throw new BadRequestException('This coupon is no longer active');
    }

    const now = new Date();

    if (now < coupon.validFrom) {
      throw new BadRequestException('This coupon is not yet valid');
    }

    if (now > coupon.validUntil) {
      throw new BadRequestException('This coupon has expired');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('This coupon has reached its usage limit');
    }

    const items = options?.items;
    const restrictionsEnabled =
      (coupon.applicableProducts?.length || 0) > 0 ||
      (coupon.applicableCategories?.length || 0) > 0;

    if (restrictionsEnabled && (!items || items.length === 0)) {
      throw new BadRequestException(
        'Coupon restrictions require cart item details to validate this coupon.',
      );
    }

    let eligibleAmount = orderAmount;

    if (restrictionsEnabled && items) {
      eligibleAmount = 0;
      for (const item of items) {
        const product = await this.productsService.findById(item.productId);
        const variant = item.sku
          ? (product.variants as any).find((variant: any) => variant.sku === item.sku)
          : undefined;

        // findById enriches the returned object with flashSalePrice when active
        const flashSalePrice: number | undefined = (product as any).flashSalePrice;
        const expectedPrice =
          flashSalePrice ??
          (variant?.priceOverride ?? product.basePrice);

        if (item.price !== expectedPrice) {
          throw new BadRequestException(
            `Price mismatch for product ${product.name}. Expected ৳${expectedPrice} but received ৳${item.price}.`,
          );
        }

        const categoryId = product.categoryId?.toString();
        const productMatches = coupon.applicableProducts?.some((id) => id.toString() === item.productId);
        const categoryMatches = coupon.applicableCategories?.some(
          (id) => id.toString() === categoryId,
        );

        if (productMatches || categoryMatches) {
          eligibleAmount += item.price * item.qty;
        }
      }

      if (eligibleAmount <= 0) {
        throw new BadRequestException(
          'This coupon does not apply to any item in your cart.',
        );
      }
    }

    if (eligibleAmount < (coupon.minimumOrderAmount || 0)) {
      throw new BadRequestException(
        `Minimum order amount of ${coupon.minimumOrderAmount} required for this coupon.`,
      );
    }

    if (coupon.perUserLimit) {
      if (!options?.userId && !options?.userEmail) {
        throw new BadRequestException(
          'Please login or provide a valid email to use this coupon.',
        );
      }

      const userQuery: Record<string, unknown> = {
        couponCode: coupon.code,
        paymentVerified: true,
      };

      if (options.userId) {
        userQuery.userId = new Types.ObjectId(options.userId);
      } else if (options.userEmail) {
        userQuery['shippingAddress.email'] = options.userEmail.toLowerCase();
      }

      const userUsageCount = await this.orderModel.countDocuments(userQuery).exec();
      if (userUsageCount >= coupon.perUserLimit) {
        throw new BadRequestException(
          'You have already used this coupon the maximum number of times.',
        );
      }
    }

    let discount: number;

    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (eligibleAmount * coupon.discountValue) / 100;
    } else {
      discount = coupon.discountValue;
    }

    if (coupon.maximumDiscount && discount > coupon.maximumDiscount) {
      discount = coupon.maximumDiscount;
    }

    if (discount > eligibleAmount) {
      discount = eligibleAmount;
    }

    if (discount > orderAmount) {
      discount = orderAmount;
    }

    return {
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      calculatedDiscount: Math.round(discount * 100) / 100,
      finalAmount: Math.round((orderAmount - discount) * 100) / 100,
    };
  }

  async findActive() {
    const now = new Date();
    return this.couponModel
      .find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
      })
      .select('code description discountType discountValue minimumOrderAmount maximumDiscount')
      .sort({ discountValue: -1, validUntil: 1 })
      .exec();
  }

  /**
   * Increment usage count after an order is placed with this coupon.
   */
  async incrementUsage(code: string) {
    const coupon = await this.couponModel
      .findOneAndUpdate(
        { code: code.toUpperCase() },
        { $inc: { usedCount: 1 } },
        { new: true },
      )
      .exec();

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    return coupon;
  }

  /**
   * Admin: list all coupons.
   */
  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [coupons, total] = await Promise.all([
      this.couponModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.couponModel.countDocuments().exec(),
    ]);

    return {
      coupons,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Admin: create a coupon.
   */
  async create(dto: CreateCouponDto) {
    const coupon = new this.couponModel({
      ...dto,
      code: dto.code.toUpperCase(),
    });

    return coupon.save();
  }

  /**
   * Admin: update a coupon.
   */
  async update(id: string, dto: UpdateCouponDto) {
    const coupon = await this.couponModel.findById(id).exec();

    if (!coupon) {
      throw new NotFoundException(`Coupon with id "${id}" not found`);
    }

    if (dto.code) {
      dto.code = dto.code.toUpperCase();
    }

    Object.assign(coupon, dto);
    return coupon.save();
  }

  /**
   * Admin: deactivate a coupon (soft delete).
   */
  async deactivate(id: string) {
    const coupon = await this.couponModel.findById(id).exec();

    if (!coupon) {
      throw new NotFoundException(`Coupon with id "${id}" not found`);
    }

    coupon.isActive = false;
    await coupon.save();

    return { message: 'Coupon deactivated successfully' };
  }
}
