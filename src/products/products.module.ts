import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema';
import { Category, CategorySchema } from './schemas/category.schema';
import {
  InventoryAdjustment,
  InventoryAdjustmentSchema,
} from './schemas/inventory-adjustment.schema';
import { FlashSale, FlashSaleSchema } from './schemas/flash-sale.schema';
import { ProductsService } from './products.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: InventoryAdjustment.name, schema: InventoryAdjustmentSchema },
      { name: FlashSale.name, schema: FlashSaleSchema },
    ]),
  ],
  providers: [ProductsService],
  exports: [MongooseModule, ProductsService],
})
export class ProductsModule {}
