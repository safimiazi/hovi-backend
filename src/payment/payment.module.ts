import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersModule } from '../orders/orders.module';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [ConfigModule, OrdersModule],
  controllers: [PaymentController],
  providers: [PaymentService],
})
export class PaymentModule {}
