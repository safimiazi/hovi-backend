import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '../../common/constants/order-status.enum';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}
