import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  /**
   * Create a new category.
   * Validates parent exists if parentId is provided.
   */
  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    // Check slug uniqueness
    const existing = await this.categoryModel.findOne({ slug: dto.slug }).exec();
    if (existing) {
      throw new BadRequestException(`Category with slug "${dto.slug}" already exists`);
    }

    if (dto.parentId) {
      const parent = await this.categoryModel.findById(dto.parentId).exec();
      if (!parent) {
        throw new BadRequestException(`Parent category with id "${dto.parentId}" not found`);
      }
    }

    const category = new this.categoryModel({
      ...dto,
      ...(dto.parentId && { parentId: new Types.ObjectId(dto.parentId) }),
    });

    return category.save();
  }

  /**
   * Update an existing category.
   */
  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    // If slug is being changed, check uniqueness
    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.categoryModel.findOne({ slug: dto.slug }).exec();
      if (existing) {
        throw new BadRequestException(`Category with slug "${dto.slug}" already exists`);
      }
    }

    if (dto.parentId) {
      // Prevent self-reference
      if (dto.parentId === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }
      const parent = await this.categoryModel.findById(dto.parentId).exec();
      if (!parent) {
        throw new BadRequestException(`Parent category with id "${dto.parentId}" not found`);
      }
    }

    Object.assign(category, dto);
    if (dto.parentId) {
      category.parentId = new Types.ObjectId(dto.parentId);
    }

    return category.save();
  }

  /**
   * Soft-delete: set isActive to false.
   */
  async deactivate(id: string): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }
    category.isActive = false;
    return category.save();
  }

  /**
   * Get a single category by ID.
   */
  async findById(id: string): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }
    return category;
  }

  /**
   * List all active categories sorted by sortOrder.
   * Optionally filter by parentId for sub-categories.
   */
  async findAll(parentId?: string): Promise<CategoryDocument[]> {
    const filter: Record<string, unknown> = { isActive: true };
    if (parentId) {
      filter.parentId = new Types.ObjectId(parentId);
    }
    return this.categoryModel.find(filter).sort({ sortOrder: 1, name: 1 }).exec();
  }

  /**
   * List ALL categories (including inactive) for admin.
   */
  async findAllAdmin(): Promise<CategoryDocument[]> {
    return this.categoryModel.find().sort({ sortOrder: 1, name: 1 }).exec();
  }
}
