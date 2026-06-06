import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'Kine Deo API',
      timestamp: new Date().toISOString(),
    };
  }
}
