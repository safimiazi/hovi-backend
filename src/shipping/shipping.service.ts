import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShippingSettings, ShippingSettingsDocument } from './schemas/shipping-settings.schema';
import { UpdateShippingSettingsDto } from './dto/update-shipping-settings.dto';

@Injectable()
export class ShippingService {
  constructor(
    @InjectModel(ShippingSettings.name)
    private readonly model: Model<ShippingSettingsDocument>,
  ) {}

  /**
   * Get the singleton shipping settings document.
   * Creates one with defaults if it doesn't exist yet.
   */
  async getSettings(): Promise<ShippingSettingsDocument> {
    let settings = await this.model.findOne().exec();
    if (!settings) {
      settings = await this.model.create({});
    }
    return settings;
  }

  /**
   * Update the singleton shipping settings document.
   * Creates one if it doesn't exist yet.
   */
  async updateSettings(dto: UpdateShippingSettingsDto): Promise<ShippingSettingsDocument> {
    let settings = await this.model.findOne().exec();
    if (!settings) {
      settings = await this.model.create(dto);
    } else {
      Object.assign(settings, dto);
      await settings.save();
    }
    return settings;
  }

  /**
   * Calculate the shipping cost for an order based on division.
   * - Dhaka division → 60 BDT
   * - Any other division → 120 BDT
   * The method parameter is kept for future express support.
   */
  async calculateShipping(
    subtotal: number,
    method: 'standard' | 'express',
    division?: string,
  ): Promise<number> {
    // Division-based pricing takes priority
    if (division) {
      const isDhaka = division.toLowerCase() === 'dhaka';
      return isDhaka ? 60 : 120;
    }

    // Fallback to DB settings when no division provided (backward compat)
    const s = await this.getSettings();
    if (method === 'express') {
      return s.expressEnabled ? s.expressCost : s.standardCost;
    }
    if (s.freeShippingEnabled && subtotal >= s.freeShippingThreshold) {
      return 0;
    }
    return s.standardCost;
  }
}
