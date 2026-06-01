import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { UserRole } from '../common/constants/user-role.enum';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * List all customers with pagination and optional search by name/email/phone.
   */
  async findAll(page: number = 1, limit: number = 10, search?: string) {
    const filter: Record<string, unknown> = { role: UserRole.CUSTOMER };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return {
      customers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single customer by ID.
   */
  async findById(id: string) {
    const customer = await this.userModel
      .findById(id)
      .select('-passwordHash')
      .exec();

    if (!customer || customer.role !== UserRole.CUSTOMER) {
      throw new NotFoundException(`Customer with id "${id}" not found`);
    }

    return customer;
  }

  /**
   * Toggle a customer's active status.
   */
  async toggleActive(id: string) {
    const customer = await this.userModel.findById(id).exec();

    if (!customer || customer.role !== UserRole.CUSTOMER) {
      throw new NotFoundException(`Customer with id "${id}" not found`);
    }

    customer.isActive = !customer.isActive;
    await customer.save();

    return {
      id: customer._id,
      isActive: customer.isActive,
      message: customer.isActive
        ? 'Customer activated successfully'
        : 'Customer deactivated successfully',
    };
  }

  /**
   * Get customer statistics: total, active, new this month.
   */
  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, newThisMonth] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.CUSTOMER }).exec(),
      this.userModel
        .countDocuments({ role: UserRole.CUSTOMER, isActive: true })
        .exec(),
      this.userModel
        .countDocuments({
          role: UserRole.CUSTOMER,
          createdAt: { $gte: startOfMonth },
        })
        .exec(),
    ]);

    return { total, active, inactive: total - active, newThisMonth };
  }

  /**
   * Find an existing customer by phone, or create a new guest account.
   * Used during checkout to ensure every order is linked to a user record.
   * Returns the user's ID.
   */
  async findOrCreateByPhone(
    phone: string,
    name: string,
    email?: string,
  ): Promise<string> {
    // Normalize phone — strip leading zeros/country code for consistent matching
    const normalizedPhone = phone.replace(/^(\+88|88|0)/, '').replace(/\D/g, '');
    const phoneVariants = [normalizedPhone, `0${normalizedPhone}`];

    // Try to find existing user by phone
    let user = await this.userModel
      .findOne({ phone: { $in: phoneVariants }, role: UserRole.CUSTOMER })
      .exec();

    if (user) {
      // Update name/email if missing
      let changed = false;
      if (!user.name || user.name.startsWith('User ')) {
        user.name = name;
        changed = true;
      }
      if (email && !user.email) {
        user.email = email.toLowerCase();
        changed = true;
      }
      if (changed) await user.save();
      return user._id.toString();
    }

    // Also try by email if provided
    if (email) {
      user = await this.userModel
        .findOne({ email: email.toLowerCase(), role: UserRole.CUSTOMER })
        .exec();

      if (user) {
        // Link phone to existing email account if not already set
        if (!user.phone) {
          user.phone = `0${normalizedPhone}`;
          await user.save();
        }
        return user._id.toString();
      }
    }

    // Create new guest customer
    const newUser = await this.userModel.create({
      name,
      phone: `0${normalizedPhone}`,
      email: email ? email.toLowerCase() : undefined,
      role: UserRole.CUSTOMER,
      isActive: true,
    });

    return newUser._id.toString();
  }
}
