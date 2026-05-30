import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('flash-sales')
export class FlashSalesController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Get currently active flash sales (public).
   */
  @Public()
  @Get('active')
  getActive() {
    return this.productsService.getActiveFlashSales();
  }

  /**
   * Admin: list all flash sales (past, active, future).
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get()
  listAll() {
    return this.productsService.listFlashSales();
  }

  /**
   * Admin: create a flash sale.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  create(
    @Body()
    body: {
      name: string;
      startTime: Date;
      endTime: Date;
      products: { productId: string; salePrice: number }[];
    },
  ) {
    return this.productsService.createFlashSale(
      body.name,
      new Date(body.startTime),
      new Date(body.endTime),
      body.products,
    );
  }

  /**
   * Admin: update a flash sale.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      startTime?: Date;
      endTime?: Date;
      isActive?: boolean;
      products?: { productId: string; salePrice: number }[];
    },
  ) {
    const updates: any = { ...body };
    if (body.startTime) updates.startTime = new Date(body.startTime);
    if (body.endTime) updates.endTime = new Date(body.endTime);
    return this.productsService.updateFlashSale(id, updates);
  }
}
