import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bundle, BundleDocument } from './schemas/bundle.schema';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

@Injectable()
export class BundlesService {
  constructor(
    @InjectModel(Bundle.name)
    private readonly bundleModel: Model<BundleDocument>,
  ) {}

  async create(dto: CreateBundleDto): Promise<Bundle> {
    // If this bundle is being set active, deactivate all others first
    if (dto.isActive) {
      await this.bundleModel.updateMany({}, { $set: { isActive: false } });
    }

    return this.bundleModel.create({
      ...dto,
      productIds: dto.productIds.map((id) => new Types.ObjectId(id)),
      isActive: dto.isActive ?? false,
    });
  }

  async findAll(): Promise<Bundle[]> {
    return this.bundleModel.find().sort({ createdAt: -1 }).lean();
  }

  async findActive() {
    const bundle = await this.bundleModel
      .findOne({ isActive: true })
      .populate('productIds', 'name basePrice originalPrice images shortDescription badge')
      .lean();

    return bundle ?? null;
  }

  async findOne(id: string): Promise<Bundle> {
    const bundle = await this.bundleModel
      .findById(id)
      .populate('productIds', 'name basePrice originalPrice images shortDescription badge salesCount averageRating reviewCount variants')
      .lean();

    if (!bundle) throw new NotFoundException(`Bundle "${id}" not found`);
    return bundle;
  }

  async update(id: string, dto: UpdateBundleDto): Promise<Bundle> {
    // If activating this bundle, deactivate all others
    if (dto.isActive === true) {
      await this.bundleModel.updateMany(
        { _id: { $ne: new Types.ObjectId(id) } },
        { $set: { isActive: false } },
      );
    }

    const updateData: any = { ...dto };
    if (dto.productIds) {
      updateData.productIds = dto.productIds.map((pid) => new Types.ObjectId(pid));
    }

    const updated = await this.bundleModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true })
      .lean();

    if (!updated) throw new NotFoundException(`Bundle "${id}" not found`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.bundleModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException(`Bundle "${id}" not found`);
  }
}
