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
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, CreateVariantDto, UpdateVariantDto } from './dto';
import { Public, Roles, CurrentUser } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ─── Public Endpoints ──────────────────────────────────────────────────────

  /**
   * List products with pagination and optional filters.
   * Public — no auth required.
   */
  @Public()
  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(page || 1, limit || 12, categoryId, search);
  }

  /**
   * Get a single product by ID. Public.
   */
  @Public()
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  // ─── Admin Endpoints ───────────────────────────────────────────────────────

  /**
   * Create a new product (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  /**
   * Update a product (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  /**
   * Soft-delete a product (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.productsService.softDelete(id);
  }

  // ─── Variant Endpoints ─────────────────────────────────────────────────────

  /**
   * Add a variant to a product (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post(':id/variants')
  addVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.productsService.addVariant(id, dto);
  }

  /**
   * Update a variant (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put(':id/variants/:variantId')
  updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(id, variantId, dto);
  }

  // ─── Inventory Endpoints ───────────────────────────────────────────────────

  /**
   * Check stock for a variant (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get(':id/stock/:sku')
  checkStock(
    @Param('id') id: string,
    @Param('sku') sku: string,
    @Query('qty') qty?: number,
  ) {
    return this.productsService.checkStock(id, sku, qty || 1);
  }

  /**
   * Manually adjust stock (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put(':id/stock/:sku')
  adjustStock(
    @Param('id') id: string,
    @Param('sku') sku: string,
    @Body() body: { newQuantity: number; reason: string },
    @CurrentUser() user: { userId: string },
  ) {
    return this.productsService.adjustStock(id, sku, body.newQuantity, body.reason, user.userId);
  }

  // ─── Image Endpoints ───────────────────────────────────────────────────────

  /**
   * Upload images for a product (admin only).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post(':id/images')
  uploadImages(@Param('id') id: string, @Body() body: { imageUrls: string[] }) {
    return this.productsService.uploadImages(id, body.imageUrls);
  }
}
