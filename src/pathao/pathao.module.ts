import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PathaoService } from './pathao.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [PathaoService],
  exports: [PathaoService],
})
export class PathaoModule {}
