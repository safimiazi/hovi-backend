import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShippingSettings, ShippingSettingsSchema } from './schemas/shipping-settings.schema';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShippingSettings.name, schema: ShippingSettingsSchema },
    ]),
  ],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
