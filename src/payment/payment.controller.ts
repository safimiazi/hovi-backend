import {
  Body,
  Controller,
  Post,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Public } from '../common/decorators';
import { PaymentService } from './payment.service';
import { CreateSslCommerzPaymentDto } from './dto/create-sslcommerz-payment.dto';
import { Request } from 'express';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Public()
  @Post('sslcommerz/init')
  async initiate(@Body() dto: CreateSslCommerzPaymentDto) {
    const { redirectUrl } = await this.paymentService.initiateSslCommerzPayment(dto);
    return { success: true, redirectUrl };
  }

  @Public()
  @Post('sslcommerz/ipn')
  async handleIpn(@Req() request: Request) {
    const body = request.body as Record<string, string>;
    const valId = body.val_id || body.valId;
    const tranId = body.tran_id || body.tranId;

    if (!valId || !tranId) {
      throw new BadRequestException('Missing val_id or tran_id in IPN request');
    }

    await this.paymentService.processSslCommerzIpn(valId, tranId);
    return { status: 'success' };
  }
}
