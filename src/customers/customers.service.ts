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
}
