import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { Category, CategoryDocument } from './schemas/category.schema';
import {
  InventoryAdjustment,
  InventoryAdjustmentDocument,
} from './schemas/inventory-adjustment.schema';
import { FlashSale, FlashSaleDocument } from './schemas/flash-sale.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(InventoryAdjustment.name)
    private readonly inventoryAdjustmentModel: Model<InventoryAdjustmentDocument>,
    @InjectModel(FlashSale.name)
    private readonly flashSaleModel: Model<FlashSaleDocument>,
  ) {}

  /**
   * Generate searchText by concatenating name, description, and shortDescription.
   * Used for MongoDB text index search.
   */
  private generateSearchText(
    name: string,
    description: string,
    shortDescription: string,
  ): string {
    return `${name} ${description} ${shortDescription}`;
  }

  /**
   * Create a new product. Validates that the categoryId exists before creating.
   */
  async create(createProductDto: CreateProductDto): Promise<ProductDocument> {
    const category = await this.categoryModel
      .findById(createProductDto.categoryId)
      .exec();

    if (!category) {
      throw new BadRequestException(
        `Category with id "${createProductDto.categoryId}" not found`,
      );
    }

    const searchText = this.generateSearchText(
      createProductDto.name,
      createProductDto.description,
      createProductDto.shortDescription,
    );

    const product = new this.productModel({
      ...createProductDto,
      categoryId: new Types.ObjectId(createProductDto.categoryId),
      searchText,
    });

    return product.save();
  }

  /**
   * Update an existing product. Regenerates searchText if name, description,
   * or shortDescription are updated.
   */
  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    if (updateProductDto.categoryId) {
      const category = await this.categoryModel
        .findById(updateProductDto.categoryId)
        .exec();

      if (!category) {
        throw new BadRequestException(
          `Category with id "${updateProductDto.categoryId}" not found`,
        );
      }
    }

    // Apply updates
    Object.assign(product, updateProductDto);

    if (updateProductDto.categoryId) {
      product.categoryId = new Types.ObjectId(updateProductDto.categoryId);
    }

    // Regenerate searchText with current values
    product.searchText = this.generateSearchText(
      product.name,
      product.description,
      product.shortDescription,
    );

    return product.save();
  }

  /**
   * Soft-delete a product by setting isDeleted to true.
   * Product is hidden from customer queries but preserved in orders.
   */
  async softDelete(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    product.isDeleted = true;
    return product.save();
  }

  /**
   * Find a product by ID. Returns product with variants, images, averageRating,
   * and reviewCount. Throws NotFoundException if product not found or is soft-deleted.
   * Includes flash sale pricing info if the product is in an active flash sale.
   */
  async findById(id: string): Promise<ProductDocument & { flashSalePrice?: number; flashSaleEndTime?: Date }> {
    const product = await this.productModel.findById(id).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    const flashSaleInfo = await this.getFlashSalePrice(id);
    if (flashSaleInfo) {
      const productObj = product.toObject();
      (productObj as any).flashSalePrice = flashSaleInfo.salePrice;
      (productObj as any).flashSaleEndTime = flashSaleInfo.endTime;
      return productObj as any;
    }

    return product;
  }

  /**
   * Find all products with pagination and optional category filter.
   * Excludes soft-deleted products. Includes flash sale pricing info when applicable.
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    categoryId?: string,
  ): Promise<{ products: (ProductDocument & { flashSalePrice?: number; flashSaleEndTime?: Date })[]; total: number }> {
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (categoryId) {
      filter.categoryId = new Types.ObjectId(categoryId);
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.productModel.find(filter).skip(skip).limit(limit).exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);

    // Enrich products with flash sale pricing
    const now = new Date();
    const activeSales = await this.flashSaleModel
      .find({
        isActive: true,
        startTime: { $lte: now },
        endTime: { $gte: now },
      })
      .exec();

    const enrichedProducts = products.map((product) => {
      const productObj = product.toObject();
      for (const sale of activeSales) {
        const saleItem = sale.products.find(
          (item) => item.productId.toString() === product._id.toString(),
        );
        if (saleItem) {
          (productObj as any).flashSalePrice = saleItem.salePrice;
          (productObj as any).flashSaleEndTime = sale.endTime;
          break;
        }
      }
      return productObj as any;
    });

    return { products: enrichedProducts, total };
  }

  /**
   * Add a variant to an existing product.
   * Pushes the new variant into the product's variants array.
   */
  async addVariant(
    productId: string,
    createVariantDto: CreateVariantDto,
  ): Promise<ProductDocument> {
    const product = await this.productModel.findById(productId).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(
        `Product with id "${productId}" not found`,
      );
    }

    product.variants.push(createVariantDto as any);
    return product.save();
  }

  /**
   * Update an existing variant within a product.
   * Finds the variant by its _id and applies the updates.
   */
  async updateVariant(
    productId: string,
    variantId: string,
    updateVariantDto: UpdateVariantDto,
  ): Promise<ProductDocument> {
    const product = await this.productModel.findById(productId).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(
        `Product with id "${productId}" not found`,
      );
    }

    const variant = (product.variants as any).id(variantId);

    if (!variant) {
      throw new NotFoundException(
        `Variant with id "${variantId}" not found in product "${productId}"`,
      );
    }

    Object.assign(variant, updateVariantDto);
    return product.save();
  }

  /**
   * Upload images for a product.
   * Accepts an array of image URLs and appends them to the product's images array.
   */
  async uploadImages(
    productId: string,
    imageUrls: string[],
  ): Promise<ProductDocument> {
    const product = await this.productModel.findById(productId).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(
        `Product with id "${productId}" not found`,
      );
    }

    product.images.push(...imageUrls);
    return product.save();
  }

  /**
   * Create a new category.
   * If parentId is provided, validates that the parent category exists.
   */
  async createCategory(
    createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryDocument> {
    if (createCategoryDto.parentId) {
      const parent = await this.categoryModel
        .findById(createCategoryDto.parentId)
        .exec();

      if (!parent) {
        throw new BadRequestException(
          `Parent category with id "${createCategoryDto.parentId}" not found`,
        );
      }
    }

    const category = new this.categoryModel({
      ...createCategoryDto,
      ...(createCategoryDto.parentId && {
        parentId: new Types.ObjectId(createCategoryDto.parentId),
      }),
    });

    return category.save();
  }

  /**
   * List all active categories sorted by sortOrder.
   * Supports hierarchy via parentId references.
   */
  async listCategories(): Promise<CategoryDocument[]> {
    return this.categoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1 })
      .exec();
  }

  // ─── Inventory Management ─────────────────────────────────────────────────────

  /**
   * Atomically decrement stock for a variant using MongoDB $inc with a guard filter.
   * The filter ensures stockQuantity >= requested quantity, preventing overselling.
   * Returns the updated product and a lowStock flag.
   */
  async decrementStock(
    productId: string,
    variantSku: string,
    quantity: number,
  ): Promise<{ product: ProductDocument; lowStock: boolean }> {
    const updatedProduct = await this.productModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(productId),
          'variants.sku': variantSku,
          'variants.stockQuantity': { $gte: quantity },
        },
        {
          $inc: {
            'variants.$.stockQuantity': -quantity,
            salesCount: quantity,
          },
        },
        { new: true },
      )
      .exec();

    if (!updatedProduct) {
      throw new BadRequestException('Insufficient stock');
    }

    const variant = updatedProduct.variants.find((v) => v.sku === variantSku);
    const lowStock = variant
      ? variant.stockQuantity <= variant.lowStockThreshold
      : false;

    return { product: updatedProduct, lowStock };
  }

  /**
   * Restore stock for a variant (used when orders are cancelled).
   * Atomically increments the variant's stockQuantity.
   */
  async restoreStock(
    productId: string,
    variantSku: string,
    quantity: number,
  ): Promise<ProductDocument> {
    const updatedProduct = await this.productModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(productId),
          'variants.sku': variantSku,
        },
        {
          $inc: { 'variants.$.stockQuantity': quantity },
        },
        { new: true },
      )
      .exec();

    if (!updatedProduct) {
      throw new NotFoundException(
        `Product "${productId}" or variant "${variantSku}" not found`,
      );
    }

    return updatedProduct;
  }

  /**
   * Check stock availability for a variant.
   * Returns whether the requested quantity is available and the current stock level.
   */
  async checkStock(
    productId: string,
    variantSku: string,
    requestedQty: number,
  ): Promise<{ available: boolean; currentStock: number }> {
    const product = await this.productModel.findById(productId).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const variant = product.variants.find((v) => v.sku === variantSku);

    if (!variant) {
      throw new NotFoundException(
        `Variant with SKU "${variantSku}" not found in product "${productId}"`,
      );
    }

    return {
      available: variant.stockQuantity >= requestedQty,
      currentStock: variant.stockQuantity,
    };
  }

  /**
   * Admin manual stock adjustment with audit trail.
   * Records the adjustment in the InventoryAdjustment collection.
   */
  async adjustStock(
    productId: string,
    variantSku: string,
    newQuantity: number,
    reason: string,
    adjustedBy: string,
  ): Promise<ProductDocument> {
    const product = await this.productModel.findById(productId).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const variant = product.variants.find((v) => v.sku === variantSku);

    if (!variant) {
      throw new NotFoundException(
        `Variant with SKU "${variantSku}" not found in product "${productId}"`,
      );
    }

    const previousQuantity = variant.stockQuantity;
    const adjustmentAmount = newQuantity - previousQuantity;

    // Update the variant's stock quantity
    await this.productModel
      .updateOne(
        {
          _id: new Types.ObjectId(productId),
          'variants.sku': variantSku,
        },
        {
          $set: { 'variants.$.stockQuantity': newQuantity },
        },
      )
      .exec();

    // Record the adjustment for audit
    await this.inventoryAdjustmentModel.create({
      productId: new Types.ObjectId(productId),
      variantSku,
      previousQuantity,
      newQuantity,
      adjustmentAmount,
      reason,
      adjustedBy: new Types.ObjectId(adjustedBy),
    });

    // Return the updated product
    return this.productModel.findById(productId).exec();
  }

  /**
   * Quick check if a variant has stock > 0.
   * Used by Cart module to prevent adding out-of-stock items.
   */
  async isVariantInStock(
    productId: string,
    variantId: string,
  ): Promise<boolean> {
    const product = await this.productModel.findById(productId).exec();

    if (!product || product.isDeleted) {
      throw new NotFoundException(`Product with id "${productId}" not found`);
    }

    const variant = (product.variants as any).id(variantId);

    if (!variant) {
      throw new NotFoundException(
        `Variant with id "${variantId}" not found in product "${productId}"`,
      );
    }

    return variant.stockQuantity > 0;
  }

  // ─── Flash Sale Management ────────────────────────────────────────────────────

  /**
   * Create a flash sale. Validates that no product is in another active flash sale
   * with overlapping time, stores original prices from current product data.
   */
  async createFlashSale(
    name: string,
    startTime: Date,
    endTime: Date,
    products: { productId: string; salePrice: number }[],
  ): Promise<FlashSaleDocument> {
    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    // Validate products exist and check for overlapping active flash sales
    const productIds = products.map((p) => new Types.ObjectId(p.productId));

    // Check for overlapping active flash sales for any of the products
    const overlapping = await this.flashSaleModel
      .findOne({
        isActive: true,
        'products.productId': { $in: productIds },
        // Overlapping time: existing sale overlaps with new sale's time range
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
      })
      .exec();

    if (overlapping) {
      const conflictingProductIds = overlapping.products
        .filter((item) =>
          productIds.some((pid) => pid.toString() === item.productId.toString()),
        )
        .map((item) => item.productId.toString());

      throw new BadRequestException(
        `Products [${conflictingProductIds.join(', ')}] are already in an active flash sale "${overlapping.name}" with overlapping time`,
      );
    }

    // Fetch original prices from current product data
    const flashSaleProducts = await Promise.all(
      products.map(async (item) => {
        const product = await this.productModel
          .findById(item.productId)
          .exec();

        if (!product || product.isDeleted) {
          throw new NotFoundException(
            `Product with id "${item.productId}" not found`,
          );
        }

        if (item.salePrice >= product.basePrice) {
          throw new BadRequestException(
            `Sale price (${item.salePrice}) must be less than the original price (${product.basePrice}) for product "${product.name}"`,
          );
        }

        return {
          productId: new Types.ObjectId(item.productId),
          originalPrice: product.basePrice,
          salePrice: item.salePrice,
        };
      }),
    );

    const flashSale = new this.flashSaleModel({
      name,
      startTime,
      endTime,
      products: flashSaleProducts,
      isActive: true,
    });

    return flashSale.save();
  }

  /**
   * Get all currently active flash sales (where current time is between start and end).
   */
  async getActiveFlashSales(): Promise<FlashSaleDocument[]> {
    const now = new Date();
    return this.flashSaleModel
      .find({
        isActive: true,
        startTime: { $lte: now },
        endTime: { $gte: now },
      })
      .exec();
  }

  /**
   * Check if a product is in an active flash sale.
   * Returns the sale price and end time if yes, null otherwise.
   * This is a query-time check — no scheduled job needed for price reversion.
   */
  async getFlashSalePrice(
    productId: string,
  ): Promise<{ salePrice: number; originalPrice: number; endTime: Date } | null> {
    const now = new Date();
    const activeSale = await this.flashSaleModel
      .findOne({
        isActive: true,
        startTime: { $lte: now },
        endTime: { $gte: now },
        'products.productId': new Types.ObjectId(productId),
      })
      .exec();

    if (!activeSale) {
      return null;
    }

    const saleItem = activeSale.products.find(
      (item) => item.productId.toString() === productId,
    );

    if (!saleItem) {
      return null;
    }

    return {
      salePrice: saleItem.salePrice,
      originalPrice: saleItem.originalPrice,
      endTime: activeSale.endTime,
    };
  }

  /**
   * List all flash sales for admin (includes past, active, and future).
   */
  async listFlashSales(): Promise<FlashSaleDocument[]> {
    return this.flashSaleModel.find().sort({ createdAt: -1 }).exec();
  }

  /**
   * Update a flash sale configuration.
   * Validates overlapping constraints if products or times are changed.
   */
  async updateFlashSale(
    id: string,
    updates: {
      name?: string;
      startTime?: Date;
      endTime?: Date;
      isActive?: boolean;
      products?: { productId: string; salePrice: number }[];
    },
  ): Promise<FlashSaleDocument> {
    const flashSale = await this.flashSaleModel.findById(id).exec();

    if (!flashSale) {
      throw new NotFoundException(`Flash sale with id "${id}" not found`);
    }

    // If updating time range or products, validate no overlaps
    const newStartTime = updates.startTime || flashSale.startTime;
    const newEndTime = updates.endTime || flashSale.endTime;

    if (newStartTime >= newEndTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    if (updates.products) {
      const productIds = updates.products.map(
        (p) => new Types.ObjectId(p.productId),
      );

      // Check for overlapping active flash sales (excluding this one)
      const overlapping = await this.flashSaleModel
        .findOne({
          _id: { $ne: new Types.ObjectId(id) },
          isActive: true,
          'products.productId': { $in: productIds },
          startTime: { $lt: newEndTime },
          endTime: { $gt: newStartTime },
        })
        .exec();

      if (overlapping) {
        throw new BadRequestException(
          `Some products are already in another active flash sale "${overlapping.name}" with overlapping time`,
        );
      }

      // Fetch original prices for new products
      const flashSaleProducts = await Promise.all(
        updates.products.map(async (item) => {
          const product = await this.productModel
            .findById(item.productId)
            .exec();

          if (!product || product.isDeleted) {
            throw new NotFoundException(
              `Product with id "${item.productId}" not found`,
            );
          }

          return {
            productId: new Types.ObjectId(item.productId),
            originalPrice: product.basePrice,
            salePrice: item.salePrice,
          };
        }),
      );

      flashSale.products = flashSaleProducts as any;
    }

    if (updates.name !== undefined) flashSale.name = updates.name;
    if (updates.startTime !== undefined) flashSale.startTime = updates.startTime;
    if (updates.endTime !== undefined) flashSale.endTime = updates.endTime;
    if (updates.isActive !== undefined) flashSale.isActive = updates.isActive;

    return flashSale.save();
  }
}
