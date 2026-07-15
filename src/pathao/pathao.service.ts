import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { OrderDocument } from '../orders/schemas/order.schema';
import { CITY_ZONE_MAP, DEFAULT_CITY_ID, DEFAULT_ZONE_ID } from './constants/city-zone-map';

interface PathaoConsignmentPayload {
  store_id: number;
  merchant_order_id: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  // recipient_city and recipient_zone are intentionally omitted —
  // Pathao docs say these are optional and the API will auto-detect from recipient_address.
  // Sending wrong IDs causes misrouting; omitting them is safer.
  delivery_type: 48 | 12;
  item_type: 2;
  special_instruction?: string;
  item_quantity: number;
  item_weight: number;
  amount_to_collect: number;
  item_description?: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix ms
}

@Injectable()
export class PathaoService {
  private readonly logger = new Logger(PathaoService.name);
  private tokenCache: TokenCache | null = null;

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly username: string;
  private readonly password: string;
  private readonly storeId: number;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const clientId     = this.configService.get<string>('PATHAO_CLIENT_ID');
    const clientSecret = this.configService.get<string>('PATHAO_CLIENT_SECRET');
    const username     = this.configService.get<string>('PATHAO_USERNAME');
    const password     = this.configService.get<string>('PATHAO_PASSWORD');
    const storeId      = this.configService.get<string>('PATHAO_STORE_ID');
    const baseUrl      = this.configService.get<string>('PATHAO_BASE_URL');

    const missing = [
      !clientId     && 'PATHAO_CLIENT_ID',
      !clientSecret && 'PATHAO_CLIENT_SECRET',
      !username     && 'PATHAO_USERNAME',
      !password     && 'PATHAO_PASSWORD',
      !storeId      && 'PATHAO_STORE_ID',
      !baseUrl      && 'PATHAO_BASE_URL',
    ].filter(Boolean);

    if (missing.length > 0) {
      throw new Error(`Pathao service misconfiguration: missing ${missing.join(', ')}`);
    }

    this.clientId     = clientId!;
    this.clientSecret = clientSecret!;
    this.username     = username!;
    this.password     = password!;
    this.storeId      = Number(storeId);
    this.baseUrl      = baseUrl!.replace(/\/$/, ''); // strip trailing slash
  }

  /**
   * Returns a valid Pathao bearer token.
   * Uses cached token if still valid (more than 60s remaining).
   * Re-authenticates when token is absent or about to expire.
   */
  async getToken(): Promise<string> {
    const now = Date.now();

    if (this.tokenCache && now < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.accessToken;
    }

    this.logger.log('Pathao token absent or expiring — re-authenticating');

    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          access_token: string;
          expires_in: number;
          token_type: string;
        }>(`${this.baseUrl}/aladdin/api/v1/issue-token`, {
          client_id:     this.clientId,
          client_secret: this.clientSecret,
          username:      this.username,
          password:      this.password,
          grant_type:    'password',
        }),
      );

      const { access_token, expires_in } = response.data;
      this.tokenCache = {
        accessToken: access_token,
        expiresAt:   now + expires_in * 1000,
      };

      this.logger.log('Pathao authentication successful');
      return access_token;
    } catch (err: any) {
      const detail = err?.response?.data?.message ?? err?.message ?? 'unknown error';
      this.logger.error(`Pathao authentication failed: ${detail}`);
      throw new ServiceUnavailableException(`Pathao authentication failed: ${detail}`);
    }
  }

  /**
   * Case-insensitive city name → Pathao city/zone IDs.
   * Falls back to Dhaka (1/1) for unknown cities.
   */
  resolveCity(cityName: string): { cityId: number; zoneId: number } {
    const key = cityName.trim().toLowerCase();
    const entry = CITY_ZONE_MAP[key];

    if (entry) {
      return entry;
    }

    this.logger.warn(
      `Pathao: unrecognised city "${cityName}" — falling back to Dhaka (cityId=1, zoneId=1)`,
    );
    return { cityId: DEFAULT_CITY_ID, zoneId: DEFAULT_ZONE_ID };
  }

  /**
   * Pure mapping: OrderDocument → PathaoConsignmentPayload.
   * recipient_city and recipient_zone are intentionally omitted —
   * Pathao will auto-detect them from recipient_address (per API docs).
   *
   * Address structure from our form:
   *   street = পূর্ণ ঠিকানা (বাড়ি নম্বর, রোড, মহল্লা)
   *   area   = জেলা / উপজেলা / এলাকা
   *   city   = বিভাগ / শহর (e.g. Dhaka, Sylhet)
   *
   * Pathao recipient_address = street + area + city (all parts)
   * This gives Pathao enough context to auto-detect city/zone.
   */
  buildPayload(order: OrderDocument): PathaoConsignmentPayload {
    // Build address: street → area → city (distinct parts, joined cleanly)
    const addressParts = [
      order.shippingAddress.street,
      order.shippingAddress.area,
      order.shippingAddress.city,
    ].filter((p): p is string => !!p && p.trim().length > 0);

    // Deduplicate: remove any part that is a substring of a previous part
    const dedupedParts: string[] = [];
    for (const part of addressParts) {
      const alreadyCovered = dedupedParts.some(
        (prev) =>
          prev.toLowerCase().includes(part.toLowerCase()) ||
          part.toLowerCase().includes(prev.toLowerCase()),
      );
      if (!alreadyCovered) dedupedParts.push(part);
    }

    const recipientAddress = dedupedParts.join(', ');

    const itemQuantity = order.items.reduce((sum, item) => sum + item.qty, 0);
    const itemDescription = order.items.map((item) => item.name).join(', ');
    const deliveryType: 48 | 12 = order.deliveryMethod === 'express' ? 12 : 48;
    const amountToCollect = order.paymentMethod === 'cod' ? order.total : 0;

    return {
      store_id:          this.storeId,
      merchant_order_id: order.orderNumber,
      recipient_name:    order.shippingAddress.name,
      recipient_phone:   order.shippingAddress.phone,
      recipient_address: recipientAddress,
      delivery_type:     deliveryType,
      item_type:         2,
      item_quantity:     itemQuantity,
      item_weight:       0.5,
      amount_to_collect: amountToCollect,
      item_description:  itemDescription,
    };
  }

  /**
   * Creates a consignment on Pathao and returns the consignment_id.
   * Throws BadGatewayException on Pathao API errors.
   */
  async pushConsignment(order: OrderDocument): Promise<string> {
    const token = await this.getToken();
    const payload = this.buildPayload(order);

    this.logger.log(
      `Pushing order ${order.orderNumber} to Pathao (store_id=${this.storeId})`,
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post<{
          code: number;
          message: string;
          type?: string;
          data: boolean | {
            orders?: Array<{
              consignment_id?: string;
              merchant_order_id: string;
              order_status?: string;
              [key: string]: unknown;
            }>;
          };
        }>(
          `${this.baseUrl}/aladdin/api/v1/orders/bulk`,
          { orders: [payload] },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const resData = response.data;
      const orderList = typeof resData.data === 'object' && resData.data !== null
        ? resData.data.orders
        : undefined;
      const consignmentId = orderList?.[0]?.consignment_id;

      // Pathao bulk API is async (202 Accepted) — consignment_id is not returned immediately.
      // Store merchant_order_id as tracking reference if consignment_id is absent.
      if (!consignmentId) {
        if (resData.code === 202 || resData.type === 'success' || resData.data === true) {
          const trackingId = `PATHAO-${payload.merchant_order_id}`;
          this.logger.log(`Pathao order queued (202): ${payload.merchant_order_id} → saved as ${trackingId}`);
          return trackingId;
        }
        throw new BadGatewayException('Pathao response missing consignment_id');
      }

      this.logger.log(
        `Pathao consignment created: ${consignmentId} for order ${order.orderNumber}`,
      );
      return consignmentId;
    } catch (err: any) {
      // Re-throw if already a NestJS exception
      if (err?.status !== undefined) throw err;

      const detail =
        err?.response?.data?.message ?? err?.message ?? 'unknown error';
      this.logger.error(`Pathao API error for order ${order.orderNumber}: ${detail}`);
      throw new BadGatewayException(`Pathao API error: ${detail}`);
    }
  }

  /**
   * Get Pathao consignment status by consignment ID.
   */
  async getConsignmentStatus(consignmentId: string): Promise<Record<string, unknown>> {
    const token = await this.getToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ code: number; message: string; data: Record<string, unknown> }>(
          `${this.baseUrl}/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      return (response.data?.data ?? response.data) as Record<string, unknown>;
    } catch (err: any) {
      if (err?.status !== undefined) throw err;
      const detail = err?.response?.data?.message ?? err?.message ?? 'unknown error';
      throw new BadGatewayException(`Pathao status check failed: ${detail}`);
    }
  }

  /**
   * Calculate Pathao delivery charge.
   */
  async calculateDeliveryCharge(params: {
    storeId?: number;
    itemType?: number;
    deliveryType?: number;
    itemWeight?: number;
    recipientCity?: number;
    recipientZone?: number;
  }): Promise<Record<string, unknown>> {
    const token = await this.getToken();
    const payload: Record<string, unknown> = {
      store_id:      params.storeId ?? this.storeId,
      item_type:     params.itemType ?? 2,
      delivery_type: params.deliveryType ?? 48,
      item_weight:   params.itemWeight ?? 0.5,
    };
    if (params.recipientCity) payload.recipient_city = params.recipientCity;
    if (params.recipientZone) payload.recipient_zone = params.recipientZone;

    try {
      const response = await firstValueFrom(
        this.httpService.post<{ code: number; data: Record<string, unknown> }>(
          `${this.baseUrl}/aladdin/api/v1/merchant/price-plan`,
          payload,
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        ),
      );
      return (response.data?.data ?? response.data) as Record<string, unknown>;
    } catch (err: any) {
      if (err?.status !== undefined) throw err;
      const detail = err?.response?.data?.message ?? err?.message ?? 'unknown error';
      throw new BadGatewayException(`Pathao price calc failed: ${detail}`);
    }
  }

  /**
   * Cancel a Pathao consignment. Fire-and-forget — never throws.
   */
  async cancelConsignment(consignmentId: string): Promise<void> {
    try {
      const token = await this.getToken();
      await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/aladdin/api/v1/orders/${encodeURIComponent(consignmentId)}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        ),
      );
      this.logger.log(`Pathao consignment cancelled: ${consignmentId}`);
    } catch (err: any) {
      const detail = err?.response?.data?.message ?? err?.message ?? 'unknown error';
      this.logger.warn(`Failed to cancel Pathao consignment ${consignmentId}: ${detail}`);
    }
  }

  private citiesCache: unknown[] | null = null;
  private zonesCache = new Map<number, unknown[]>();

  /**
   * Get Pathao cities list (in-memory cached).
   */
  async getCities(): Promise<unknown[]> {
    if (this.citiesCache) return this.citiesCache;
    const token = await this.getToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ data: unknown }>(
          `${this.baseUrl}/aladdin/api/v1/cities`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      const cities = (response.data as any)?.data?.data ?? (response.data as any)?.data ?? [];
      this.citiesCache = cities;
      return cities;
    } catch (err: any) {
      if (err?.status !== undefined) throw err;
      const detail = err?.response?.data?.message ?? err?.message ?? 'unknown error';
      throw new BadGatewayException(`Pathao cities fetch failed: ${detail}`);
    }
  }

  /**
   * Get Pathao zones for a city (in-memory cached).
   */
  async getZones(cityId: number): Promise<unknown[]> {
    if (this.zonesCache.has(cityId)) return this.zonesCache.get(cityId)!;
    const token = await this.getToken();
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ data: unknown }>(
          `${this.baseUrl}/aladdin/api/v1/zones/${cityId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      const zones = (response.data as any)?.data?.data ?? (response.data as any)?.data ?? [];
      this.zonesCache.set(cityId, zones);
      return zones;
    } catch (err: any) {
      if (err?.status !== undefined) throw err;
      const detail = err?.response?.data?.message ?? err?.message ?? 'unknown error';
      throw new BadGatewayException(`Pathao zones fetch failed: ${detail}`);
    }
  }
}
