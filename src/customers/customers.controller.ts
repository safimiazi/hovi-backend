import { Controller, Get, Put, Param, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';
import { ListCustomersDto } from './dto';

@Controller('customers')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * Get customer statistics.
   */
  @Get('stats')
  getStats() {
    return this.customersService.getStats();
  }

  /**
   * List all customers with pagination and search.
   */
  @Get()
  findAll(@Query() query: ListCustomersDto) {
    return this.customersService.findAll(query.page, query.limit, query.search);
  }

  /**
   * Get a single customer by ID.
   */
  @Get(':id')
  findById(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  /**
   * Toggle customer active/inactive status.
   */
  @Put(':id/toggle-active')
  toggleActive(@Param('id') id: string) {
    return this.customersService.toggleActive(id);
  }
}
