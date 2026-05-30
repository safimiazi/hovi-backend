import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Coupon, CouponDocument, DiscountType } from './schemas/coupon.schema';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(
    @InjectModel(Coupon.name)
    private readonly couponModel: Model<CouponDocument>,
  ) {}

  /**
   * Validate a coupon code and return the calculated discount.
   */
  async validate(code: string, orderAmount: number) {
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

    if (orderAmount < coupon.minimumOrderAmount) {
      throw new BadRequestException(
        `Minimum order amount of ${coupon.minimumOrderAmount} required`,
      );
    }

    // Calculate discount
    let discount: number;

    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (orderAmount * coupon.discountValue) / 100;
      // Apply maximum discount cap if set
      if (coupon.maximumDiscount && discount > coupon.maximumDiscount) {
        discount = coupon.maximumDiscount;
      }
    } else {
      discount = coupon.discountValue;
    }

    // Discount cannot exceed order amount
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
