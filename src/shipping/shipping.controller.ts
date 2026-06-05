import {
  Controller,
  Get,
  Put,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { UpdateShippingSettingsDto } from './dto/update-shipping-settings.dto';
import { Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('shipping-settings')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  /** Public — frontend reads this to show live shipping costs to customers. */
  @Public()
  @Get()
  getSettings() {
    return this.shippingService.getSettings();
  }

  /** Admin only — update shipping configuration. */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put()
  @HttpCode(HttpStatus.OK)
  updateSettings(@Body() dto: UpdateShippingSettingsDto) {
    return this.shippingService.updateSettings(dto);
  }
}
