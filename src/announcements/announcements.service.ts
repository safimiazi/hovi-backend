import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Announcement, AnnouncementDocument } from './schemas/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<AnnouncementDocument>,
  ) {}

  async create(dto: CreateAnnouncementDto) {
    if (dto.startsAt && dto.endsAt && new Date(dto.startsAt) >= new Date(dto.endsAt)) {
      throw new BadRequestException('Announcement end time must be later than start time.');
    }

    const announcement = new this.announcementModel({
      ...dto,
      isActive: dto.isActive ?? true,
      priority: dto.priority ?? 0,
    });
    return announcement.save();
  }

async findActive() {
  const now = new Date();

  return this.announcementModel
    .find({
      isActive: true,
      $or: [
        { startsAt: { $exists: false } },
        { startsAt: null },
        { startsAt: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { endsAt: { $exists: false } },
            { endsAt: null },
            { endsAt: { $gte: now } },
          ],
        },
      ],
    })
    .sort({ priority: -1, createdAt: -1 })
    .lean()
    .exec();
}

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [announcements, total] = await Promise.all([
      this.announcementModel
        .find()
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.announcementModel.countDocuments().exec(),
    ]);

    return {
      announcements,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    if (dto.startsAt && dto.endsAt && new Date(dto.startsAt) >= new Date(dto.endsAt)) {
      throw new BadRequestException('Announcement end time must be later than start time.');
    }

    const announcement = await this.announcementModel.findById(id).exec();
    if (!announcement) {
      throw new NotFoundException(`Announcement with id "${id}" not found`);
    }

    Object.assign(announcement, dto);
    return announcement.save();
  }

  async deactivate(id: string) {
    const announcement = await this.announcementModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();

    if (!announcement) {
      throw new NotFoundException(`Announcement with id "${id}" not found`);
    }

    return announcement;
  }
}
