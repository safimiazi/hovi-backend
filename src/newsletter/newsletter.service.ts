import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subscriber, SubscriberDocument } from './schemas/subscriber.schema';
import { SubscribeDto } from './dto/subscribe.dto';

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    @InjectModel(Subscriber.name)
    private readonly subscriberModel: Model<SubscriberDocument>,
  ) {}

  async subscribe(dto: SubscribeDto): Promise<{ message: string; alreadySubscribed: boolean }> {
    const existing = await this.subscriberModel
      .findOne({ email: dto.email })
      .select('isActive')
      .lean();

    if (existing) {
      if (existing.isActive) {
        // Already subscribed — return success silently (don't leak info)
        return { message: 'You are already part of the Petal Club!', alreadySubscribed: true };
      }
      // Re-subscribe if previously unsubscribed
      await this.subscriberModel.updateOne(
        { email: dto.email },
        { $set: { isActive: true, source: dto.source } },
      );
      this.logger.log(`Re-subscribed: ${dto.email}`);
      return { message: 'Welcome back to the Petal Club! 🌸', alreadySubscribed: false };
    }

    await this.subscriberModel.create({
      email: dto.email,
      source: dto.source ?? 'homepage',
    });

    this.logger.log(`New subscriber: ${dto.email}`);
    return { message: 'Welcome to the Petal Club! 🌸', alreadySubscribed: false };
  }

  async unsubscribe(email: string): Promise<{ message: string }> {
    await this.subscriberModel.updateOne(
      { email: email.toLowerCase().trim() },
      { $set: { isActive: false } },
    );
    return { message: 'You have been unsubscribed successfully.' };
  }

  // Admin: paginated list of active subscribers
  async getSubscribers(page = 1, limit = 50): Promise<{
    subscribers: { email: string; source?: string; createdAt: Date }[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const [rawSubscribers, total] = await Promise.all([
      this.subscriberModel
        .find({ isActive: true })
        .select('email source createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<{ email: string; source?: string; createdAt: Date }[]>(),
      this.subscriberModel.countDocuments({ isActive: true }),
    ]);
    const subscribers = rawSubscribers;

    return {
      subscribers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
