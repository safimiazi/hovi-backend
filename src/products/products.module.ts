import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import {
  InventoryAdjustment,
  InventoryAdjustmentSchema,
} from './schemas/inventory-adjustment.schema';
import { FlashSale, FlashSaleSchema } from './schemas/flash-sale.schema';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: InventoryAdjustment.name, schema: InventoryAdjustmentSchema },
      { name: FlashSale.name, schema: FlashSaleSchema },
    ]),
    CategoriesModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService, MongooseModule],
})
export class ProductsModule {}
