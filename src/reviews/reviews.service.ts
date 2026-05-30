import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { OrderStatus } from '../common/constants/order-status.enum';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  /**
   * Get reviews for a product (public, paginated, only approved).
   */
  async findByProduct(productId: string, page: number = 1, limit: number = 10) {
    const filter = {
      productId: new Types.ObjectId(productId),
      isApproved: true,
    };

    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('userId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Create a review. Checks for verified purchase and prevents duplicate reviews.
   */
  async create(userId: string, dto: CreateReviewDto) {
    // Check if user already reviewed this product
    const existing = await this.reviewModel
      .findOne({
        userId: new Types.ObjectId(userId),
        productId: new Types.ObjectId(dto.productId),
      })
      .exec();

    if (existing) {
      throw new ConflictException('You have already reviewed this product');
    }

    // Check if user has ordered this product (verified purchase)
    const order = await this.orderModel
      .findOne({
        userId: new Types.ObjectId(userId),
        'items.productId': new Types.ObjectId(dto.productId),
        status: { $in: [OrderStatus.DELIVERED] },
      })
      .exec();

    const isVerifiedPurchase = !!order;

    const review = new this.reviewModel({
      userId: new Types.ObjectId(userId),
      productId: new Types.ObjectId(dto.productId),
      rating: dto.rating,
      title: dto.title,
      comment: dto.comment,
      images: dto.images || [],
      isVerifiedPurchase,
    });

    const saved = await review.save();

    // Recalculate product rating
    await this.recalculateProductRating(dto.productId);

    return saved;
  }

  /**
   * Admin: list all reviews with pagination and optional approval filter.
   */
  async findAll(page: number = 1, limit: number = 10, isApproved?: boolean) {
    const filter: Record<string, unknown> = {};

    if (isApproved !== undefined) {
      filter.isApproved = isApproved;
    }

    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('userId', 'name email')
        .populate('productId', 'name images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Admin: approve a review.
   */
  async approve(id: string) {
    const review = await this.reviewModel.findById(id).exec();

    if (!review) {
      throw new NotFoundException(`Review with id "${id}" not found`);
    }

    review.isApproved = true;
    await review.save();

    // Recalculate product rating
    await this.recalculateProductRating(review.productId.toString());

    return { message: 'Review approved successfully' };
  }

  /**
   * Admin: reject a review (set isApproved to false).
   */
  async reject(id: string) {
    const review = await this.reviewModel.findById(id).exec();

    if (!review) {
      throw new NotFoundException(`Review with id "${id}" not found`);
    }

    review.isApproved = false;
    await review.save();

    // Recalculate product rating
    await this.recalculateProductRating(review.productId.toString());

    return { message: 'Review rejected successfully' };
  }

  /**
   * Admin: delete a review.
   */
  async delete(id: string) {
    const review = await this.reviewModel.findById(id).exec();

    if (!review) {
      throw new NotFoundException(`Review with id "${id}" not found`);
    }

    const productId = review.productId.toString();
    await this.reviewModel.findByIdAndDelete(id).exec();

    // Recalculate product rating
    await this.recalculateProductRating(productId);

    return { message: 'Review deleted successfully' };
  }

  /**
   * Recalculate a product's averageRating and reviewCount based on approved reviews.
   */
  private async recalculateProductRating(productId: string) {
    const result = await this.reviewModel
      .aggregate([
        {
          $match: {
            productId: new Types.ObjectId(productId),
            isApproved: true,
          },
        },
        {
          $group: {
            _id: '$productId',
            averageRating: { $avg: '$rating' },
            reviewCount: { $sum: 1 },
          },
        },
      ])
      .exec();

    if (result.length > 0) {
      await this.productModel
        .updateOne(
          { _id: new Types.ObjectId(productId) },
          {
            averageRating: Math.round(result[0].averageRating * 10) / 10,
            reviewCount: result[0].reviewCount,
          },
        )
        .exec();
    } else {
      // No approved reviews — reset to 0
      await this.productModel
        .updateOne(
          { _id: new Types.ObjectId(productId) },
          { averageRating: 0, reviewCount: 0 },
        )
        .exec();
    }
  }
}
