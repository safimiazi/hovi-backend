import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NewsletterService } from './newsletter.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { Public, Roles } from '../common/decorators';
import { UserRole } from '../common/constants/user-role.enum';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  /**
   * Subscribe to newsletter — public endpoint.
   * Rate limited: 5 requests per 10 minutes per IP to prevent abuse.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(@Body() dto: SubscribeDto) {
    return this.newsletterService.subscribe(dto);
  }

  /**
   * Unsubscribe via email param — public (linked from emails).
   */
  @Public()
  @Post('unsubscribe/:email')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@Param('email') email: string) {
    return this.newsletterService.unsubscribe(email);
  }

  /**
   * Admin: list all active subscribers with pagination.
   */
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('subscribers')
  async getSubscribers(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.newsletterService.getSubscribers(Number(page), Number(limit));
  }
}
