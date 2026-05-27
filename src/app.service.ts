import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'Petal Beauty API',
      timestamp: new Date().toISOString(),
    };
  }
}
