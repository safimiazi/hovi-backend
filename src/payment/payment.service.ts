import { Injectable, InternalServerErrorException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from '../orders/orders.service';
import { CouponsService } from '../coupons/coupons.service';
import { CustomersService } from '../customers/customers.service';
import { CreateSslCommerzPaymentDto } from './dto/create-sslcommerz-payment.dto';
import { OrderDocument } from '../orders/schemas/order.schema';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
    private readonly couponsService: CouponsService,
    private readonly customersService: CustomersService,
  ) {}

  private get storeId(): string {
    return this.configService.get<string>('SSL_COMMERZ_STORE_ID') ?? '';
  }

  private get storePassword(): string {
    return this.configService.get<string>('SSL_COMMERZ_STORE_PASSWORD') ?? '';
  }

  private get frontendBaseUrl(): string {
    return this.configService.get<string>('FRONTEND_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
  }

  private get backendBaseUrl(): string {
    return this.configService.get<string>('BACKEND_BASE_URL', 'http://localhost:4000/api').replace(/\/$/, '');
  }

  private get environment(): 'live' | 'sandbox' {
    return this.configService.get<string>('SSL_COMMERZ_ENVIRONMENT', 'sandbox') === 'live'
      ? 'live'
      : 'sandbox';
  }

  private getGatewayUrl(): string {
    return this.environment === 'live'
      ? 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'
      : 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';
  }

  private getValidationUrl(valId: string): string {
    return `${this.environment === 'live'
      ? 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
      : 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'}?val_id=${encodeURIComponent(
      valId,
    )}&store_id=${encodeURIComponent(this.storeId)}&store_passwd=${encodeURIComponent(
      this.storePassword,
    )}&v=1&format=json`;
  }

  private getProductName(items: { name: string }[]): string {
    return items.length === 1 ? items[0].name : `${items.length} items from HOVI`;
  }

  private ensureCredentials(): void {
    if (!this.storeId || !this.storePassword) {
      throw new InternalServerErrorException(
        'SSLCommerz credentials are not configured. Set SSL_COMMERZ_STORE_ID and SSL_COMMERZ_STORE_PASSWORD in backend environment.',
      );
    }
  }

  private buildTransactionId(): string {
    return `HOVI-${Date.now()}-${Math.floor(Math.random() * 900000 + 100000)}`;
  }

  async initiateSslCommerzPayment(dto: CreateSslCommerzPaymentDto): Promise<{ redirectUrl: string; transactionId: string }> {
    this.ensureCredentials();

    const paymentMethod = 'sslcommerz' as const;
    const deliveryMethod = dto.deliveryMethod ?? 'standard';
    const transactionId = this.buildTransactionId();

    // Auto-create or find customer by phone so every order is linked to a user
    let userId: string | undefined;
    try {
      userId = await this.customersService.findOrCreateByPhone(
        dto.shippingAddress.phone,
        dto.shippingAddress.name,
        dto.shippingAddress.email,
      );
      this.logger.log(`Order linked to customer: ${userId}`);
    } catch (err: any) {
      // Non-fatal — order can still be placed without a userId
      this.logger.warn(`Could not find/create customer: ${err.message}`);
    }

    const order = await this.ordersService.create(
      {
        items: dto.items,
        shippingAddress: dto.shippingAddress,
        deliveryMethod,
        paymentMethod,
        couponCode: dto.couponCode,
        discountAmount: dto.discountAmount,
      },
      userId,
      transactionId,
    );

    const session = await this.createSslCommerzSession(order);
    return { redirectUrl: session.GatewayPageURL, transactionId };
  }

  async processSslCommerzIpn(valId: string, tranId: string): Promise<OrderDocument> {
    const validation = await this.validateSslCommerzIPN(valId);
    const order = await this.ordersService.markOrderPaid(tranId, validation);
    if (!order) {
      throw new NotFoundException(`Order not found for transaction id ${tranId}`);
    }

    if (order.couponCode) {
      try {
        await this.couponsService.incrementUsage(order.couponCode);
      } catch {
        // Do not stop order confirmation if coupon usage increment fails.
      }
    }

    return order;
  }

  async validateSslCommerzIPN(valId: string): Promise<Record<string, unknown>> {
    this.ensureCredentials();

    const response = await fetch(this.getValidationUrl(valId));
    if (!response.ok) {
      throw new InternalServerErrorException(`SSLCommerz validation request failed with status ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const status = String(data.status ?? '').toUpperCase();
    if (status !== 'VALID' && status !== 'VALIDATED') {
      throw new InternalServerErrorException(`SSLCommerz validation failed: ${String(data.status)}`);
    }

    return data;
  }

  private async createSslCommerzSession(order: OrderDocument): Promise<Record<string, any>> {
    this.ensureCredentials();

    const payload = new URLSearchParams();
    payload.append('store_id', this.storeId);
    payload.append('store_passwd', this.storePassword);
    payload.append('total_amount', String(order.total));
    payload.append('currency', 'BDT');
    payload.append('tran_id', order.transactionId ?? order.orderNumber);
    payload.append('success_url', `${this.frontendBaseUrl}/checkout/result?status=success&tran_id=${encodeURIComponent(order.transactionId ?? order.orderNumber)}`);
    payload.append('fail_url', `${this.frontendBaseUrl}/checkout/result?status=failed&tran_id=${encodeURIComponent(order.transactionId ?? order.orderNumber)}`);
    payload.append('cancel_url', `${this.frontendBaseUrl}/checkout/result?status=cancelled&tran_id=${encodeURIComponent(order.transactionId ?? order.orderNumber)}`);
    payload.append('ipn_url', `${this.backendBaseUrl}/payment/sslcommerz/ipn`);
    payload.append('cus_name', order.shippingAddress.name);
    payload.append('cus_email', order.shippingAddress.email);
    payload.append('cus_phone', order.shippingAddress.phone);
    payload.append('cus_add1', order.shippingAddress.street);
    payload.append('cus_city', order.shippingAddress.city);
    payload.append('cus_country', 'Bangladesh');
    payload.append('ship_name', order.shippingAddress.name);
    payload.append('ship_add1', order.shippingAddress.street);
    payload.append('ship_city', order.shippingAddress.city);
    payload.append('ship_postcode', order.shippingAddress.postcode);
    payload.append('ship_country', 'Bangladesh');
    payload.append('shipping_method', 'Courier');
    payload.append('product_name', this.getProductName(order.items));
    payload.append('product_category', 'Ecommerce');
    payload.append('product_profile', 'general');
    payload.append('value_a', order.orderNumber);
    payload.append('value_b', order.shippingAddress.name);
    payload.append('value_c', order.shippingAddress.phone);
    payload.append('value_d', 'hovi-backend');

    const response = await fetch(this.getGatewayUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new InternalServerErrorException(`SSLCommerz initialization failed: ${message}`);
    }

    const data = (await response.json()) as Record<string, any>;
    if (String(data.status).toUpperCase() !== 'SUCCESS' || !data.GatewayPageURL) {
      throw new InternalServerErrorException(
        String(data.failedreason ?? data.status ?? 'SSLCommerz did not return a payment URL.'),
      );
    }

    return data;
  }
}
