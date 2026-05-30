import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListCustomersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;
}
