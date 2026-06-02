import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';
import { Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('bundles')
export class BundlesController {
  constructor(private readonly bundlesService: BundlesService) {}

  /** Public — homepage PromoBanner fetches this */
  @Public()
  @Get('active')
  findActive() {
    return this.bundlesService.findActive();
  }

  /** Public — bundle detail page */
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.bundlesService.findOne(id);
  }

  /** Admin — list all bundles */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get()
  findAll() {
    return this.bundlesService.findAll();
  }

  /** Admin — create bundle */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post()
  create(@Body() dto: CreateBundleDto) {
    return this.bundlesService.create(dto);
  }

  /** Admin — update bundle */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBundleDto) {
    return this.bundlesService.update(id, dto);
  }

  /** Admin — delete bundle */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.bundlesService.remove(id);
  }
}
