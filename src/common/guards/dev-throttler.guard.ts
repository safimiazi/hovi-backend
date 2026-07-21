import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Extends ThrottlerGuard to skip rate limiting entirely in development.
 * In production, behaves identically to the standard ThrottlerGuard.
 */
@Injectable()
export class DevThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (process.env.NODE_ENV !== 'production') {
      return true; // Skip throttling in development
    }
    return super.shouldSkip(context);
  }
}
