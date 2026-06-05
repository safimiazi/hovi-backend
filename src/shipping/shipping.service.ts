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
   * Calculate the shipping cost for an order based on current DB settings.
   * Used by OrdersService to replace the hardcoded logic.
   */
  async calculateShipping(subtotal: number, method: 'standard' | 'express'): Promise<number> {
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
